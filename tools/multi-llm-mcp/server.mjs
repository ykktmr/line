#!/usr/bin/env node
/**
 * multi-llm MCP server
 *
 * Claude Code から ChatGPT / Gemini / Claude を呼び出すための stdio MCP サーバ。
 * 依存は Claude 呼び出し時の @anthropic-ai/sdk のみ（遅延 import）。
 * ChatGPT / Gemini は fetch で REST を直接叩くため、追加の npm 依存はない。
 *
 * stdout は JSON-RPC 専用。ログは必ず stderr へ出すこと。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SERVER_NAME = "multi-llm";
const SERVER_VERSION = "0.1.0";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
]);

/* ------------------------------------------------------------------ */
/* .env.local / .env の読み込み（既存の環境変数は上書きしない）        */
/* ------------------------------------------------------------------ */

function loadEnvFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).replace(/^export\s+/, "").trim();
    if (!key || key in process.env) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(REPO_ROOT, ".env.local"));
loadEnvFile(path.join(REPO_ROOT, ".env"));

/* ------------------------------------------------------------------ */
/* 共通ヘルパー                                                        */
/* ------------------------------------------------------------------ */

const TIMEOUT_MS = Number(process.env.MULTI_LLM_TIMEOUT_MS ?? 120000);

const MODELS = {
  chatgpt: () => process.env.OPENAI_MODEL || "gpt-5.6",
  gemini: () => process.env.GEMINI_MODEL || "gemini-3.8-flash",
  claude: () => process.env.CLAUDE_MODEL || "claude-opus-5",
};

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function geminiBaseUrl() {
  return (
    process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/+$/, "");
}

function requireEnv(value, hint) {
  if (!value) throw new Error(`${hint} が未設定です。.env.local か環境変数に設定してください。`);
  return value;
}

function abortSignal() {
  return AbortSignal.timeout(TIMEOUT_MS);
}

async function readErrorBody(res) {
  let text = "";
  try {
    text = (await res.text()).trim();
  } catch {
    /* ignore */
  }
  if (text.length > 800) text = `${text.slice(0, 800)}…`;
  return text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}`;
}

/* ------------------------------------------------------------------ */
/* ChatGPT (OpenAI Responses API)                                      */
/* ------------------------------------------------------------------ */

function extractOpenAIText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const chunks = [];
  for (const item of data?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const part of item?.content ?? []) {
      if (typeof part?.text === "string") chunks.push(part.text);
      else if (typeof part?.refusal === "string") chunks.push(`[refusal] ${part.refusal}`);
    }
  }
  if (chunks.length) return chunks.join("\n").trim();
  // Chat Completions 互換のレスポンスにも一応対応する。
  const legacy = data?.choices?.[0]?.message?.content;
  return typeof legacy === "string" ? legacy.trim() : "";
}

async function askChatGPT({ prompt, system, model, maxTokens }) {
  const apiKey = requireEnv(process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const usedModel = model || MODELS.chatgpt();

  const body = { model: usedModel, input: prompt };
  if (system) body.instructions = system;
  if (maxTokens) body.max_output_tokens = maxTokens;

  const res = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: abortSignal(),
  });
  if (!res.ok) throw new Error(await readErrorBody(res));

  const data = await res.json();
  let text = extractOpenAIText(data);
  if (data?.status === "incomplete") {
    const reason = data?.incomplete_details?.reason ?? "unknown";
    text += `\n\n(応答が途中で打ち切られました: ${reason}。max_tokens を増やしてください)`;
  }
  return { model: data?.model || usedModel, text: text.trim() };
}

/* ------------------------------------------------------------------ */
/* Gemini (Google Generative Language API)                             */
/* ------------------------------------------------------------------ */

async function askGemini({ prompt, system, model, maxTokens }) {
  const apiKey = requireEnv(geminiKey(), "GEMINI_API_KEY");
  const usedModel = model || MODELS.gemini();

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (maxTokens) body.generationConfig = { maxOutputTokens: maxTokens };

  const url = `${geminiBaseUrl()}/models/${encodeURIComponent(usedModel)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: abortSignal(),
  });
  if (!res.ok) throw new Error(await readErrorBody(res));

  const data = await res.json();
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) throw new Error(`プロンプトがブロックされました: ${blockReason}`);

  const candidate = data?.candidates?.[0];
  let text = (candidate?.content?.parts ?? [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
  const finish = candidate?.finishReason;
  if (finish && finish !== "STOP") text += `\n\n(finishReason: ${finish})`;
  return { model: usedModel, text: text.trim() };
}

/* ------------------------------------------------------------------ */
/* Claude (Anthropic Messages API)                                     */
/* ------------------------------------------------------------------ */

let anthropicClient = null;

async function getAnthropic() {
  if (anthropicClient) return anthropicClient;
  let Anthropic;
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
  } catch (error) {
    throw new Error(
      "@anthropic-ai/sdk を読み込めません。リポジトリ直下で npm install を実行してください。 " +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
  anthropicClient = new Anthropic();
  return anthropicClient;
}

async function askClaude({ prompt, system, model, maxTokens }) {
  const usedModel = model || MODELS.claude();
  const client = await getAnthropic();
  const params = {
    model: usedModel,
    max_tokens: maxTokens || 16000,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) params.system = system;

  const message = await client.messages.create(params, { signal: abortSignal() });
  if (message.stop_reason === "refusal") {
    const details = message.stop_details;
    throw new Error(
      `Claude が応答を拒否しました (${details?.category ?? "unknown"}): ${details?.explanation ?? ""}`.trim(),
    );
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return { model: message.model || usedModel, text };
}

/* ------------------------------------------------------------------ */
/* モデル一覧                                                          */
/* ------------------------------------------------------------------ */

async function listChatGPTModels() {
  const apiKey = requireEnv(process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: abortSignal(),
  });
  if (!res.ok) throw new Error(await readErrorBody(res));
  const data = await res.json();
  return (data?.data ?? []).map((m) => m?.id).filter(Boolean).sort();
}

async function listGeminiModels() {
  const apiKey = requireEnv(geminiKey(), "GEMINI_API_KEY");
  const res = await fetch(`${geminiBaseUrl()}/models?pageSize=200`, {
    headers: { "x-goog-api-key": apiKey },
    signal: abortSignal(),
  });
  if (!res.ok) throw new Error(await readErrorBody(res));
  const data = await res.json();
  return (data?.models ?? [])
    .filter((m) => (m?.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => String(m?.name ?? "").replace(/^models\//, ""))
    .filter(Boolean)
    .sort();
}

async function listClaudeModels() {
  const client = await getAnthropic();
  const ids = [];
  for await (const model of client.models.list()) {
    ids.push(model.id);
    if (ids.length >= 100) break;
  }
  return ids.sort();
}

/* ------------------------------------------------------------------ */
/* ツール定義                                                          */
/* ------------------------------------------------------------------ */

const PROVIDERS = {
  chatgpt: { label: "ChatGPT", ask: askChatGPT, list: listChatGPTModels },
  gemini: { label: "Gemini", ask: askGemini, list: listGeminiModels },
  claude: { label: "Claude", ask: askClaude, list: listClaudeModels },
};

const askProperties = {
  prompt: { type: "string", description: "モデルに投げる質問・依頼の本文。" },
  system: { type: "string", description: "任意。system プロンプト（役割や出力形式の指定）。" },
  model: { type: "string", description: "任意。既定のモデル ID を上書きする。" },
  max_tokens: {
    type: "integer",
    description: "任意。生成する最大トークン数。",
    minimum: 1,
  },
};

function askSchema() {
  return {
    type: "object",
    properties: { ...askProperties },
    required: ["prompt"],
    additionalProperties: false,
  };
}

const TOOLS = [
  {
    name: "ask_chatgpt",
    title: "ChatGPT に質問する",
    description:
      "OpenAI の ChatGPT (Responses API) に単発の質問を投げて回答テキストを返す。" +
      "他モデルのセカンドオピニオンが欲しいときに使う。",
    inputSchema: askSchema(),
  },
  {
    name: "ask_gemini",
    title: "Gemini に質問する",
    description:
      "Google の Gemini (generateContent API) に単発の質問を投げて回答テキストを返す。",
    inputSchema: askSchema(),
  },
  {
    name: "ask_claude",
    title: "Claude に質問する",
    description:
      "Anthropic の Claude (Messages API) に単発の質問を投げて回答テキストを返す。" +
      "会話履歴を持たない独立したコンテキストで聞き直したいときに使う。",
    inputSchema: askSchema(),
  },
  {
    name: "ask_all",
    title: "3モデル同時に質問する",
    description:
      "ChatGPT・Gemini・Claude に同じ質問を並列で投げ、3つの回答を並べて返す。" +
      "設計判断のセカンドオピニオンや、回答の食い違いを比較したいときに使う。" +
      "1つが失敗しても残りの回答は返る。",
    inputSchema: {
      type: "object",
      properties: {
        ...askProperties,
        providers: {
          type: "array",
          description: "任意。問い合わせ先を絞る（既定は3つ全部）。",
          items: { type: "string", enum: ["chatgpt", "gemini", "claude"] },
          minItems: 1,
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "list_models",
    title: "利用可能なモデル一覧",
    description:
      "指定プロバイダで実際に使えるモデル ID を API から取得する。" +
      "モデル ID は頻繁に変わるため、既定値が古い場合はこれで確認する。",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "モデル一覧を取得するプロバイダ。",
          enum: ["chatgpt", "gemini", "claude"],
        },
      },
      required: ["provider"],
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* ツール実行                                                          */
/* ------------------------------------------------------------------ */

function errorMessage(error) {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `タイムアウト (${TIMEOUT_MS}ms)。MULTI_LLM_TIMEOUT_MS で延長できます。`;
    }
    return error.message || String(error);
  }
  return String(error);
}

function askArgs(args) {
  const prompt = typeof args?.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) throw new Error("prompt は必須です。");
  return {
    prompt,
    system: typeof args?.system === "string" && args.system.trim() ? args.system : undefined,
    model: typeof args?.model === "string" && args.model.trim() ? args.model.trim() : undefined,
    maxTokens: Number.isInteger(args?.max_tokens) ? args.max_tokens : undefined,
  };
}

async function runSingle(providerKey, args) {
  const provider = PROVIDERS[providerKey];
  const started = Date.now();
  const result = await provider.ask(askArgs(args));
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const body = result.text || "(空の応答)";
  return `## ${provider.label} (${result.model}, ${elapsed}s)\n\n${body}`;
}

async function runAll(args) {
  const parsed = askArgs(args);
  const requested = Array.isArray(args?.providers) && args.providers.length
    ? args.providers
    : ["chatgpt", "gemini", "claude"];
  const keys = requested.filter((key) => key in PROVIDERS);
  if (!keys.length) throw new Error("providers に有効なプロバイダがありません。");

  const settled = await Promise.allSettled(
    keys.map(async (key) => {
      const started = Date.now();
      const result = await PROVIDERS[key].ask(parsed);
      return { key, result, elapsed: (Date.now() - started) / 1000 };
    }),
  );

  const sections = settled.map((outcome, index) => {
    const key = keys[index];
    const label = PROVIDERS[key].label;
    if (outcome.status === "rejected") {
      return `## ${label}\n\n⚠️ 失敗: ${errorMessage(outcome.reason)}`;
    }
    const { result, elapsed } = outcome.value;
    return `## ${label} (${result.model}, ${elapsed.toFixed(1)}s)\n\n${result.text || "(空の応答)"}`;
  });

  const failures = settled.filter((o) => o.status === "rejected").length;
  const header =
    failures > 0
      ? `${keys.length} 件中 ${keys.length - failures} 件が成功しました。\n\n`
      : "";
  return header + sections.join("\n\n---\n\n");
}

async function callTool(name, args) {
  switch (name) {
    case "ask_chatgpt":
      return runSingle("chatgpt", args);
    case "ask_gemini":
      return runSingle("gemini", args);
    case "ask_claude":
      return runSingle("claude", args);
    case "ask_all":
      return runAll(args);
    case "list_models": {
      const provider = PROVIDERS[args?.provider];
      if (!provider) throw new Error("provider は chatgpt / gemini / claude のいずれかです。");
      const ids = await provider.list();
      const current = MODELS[args.provider]();
      return `${provider.label} で利用可能なモデル (既定: ${current}):\n\n${ids.map((id) => `- ${id}`).join("\n")}`;
    }
    default:
      throw new Error(`未知のツール: ${name}`);
  }
}

/* ------------------------------------------------------------------ */
/* JSON-RPC (MCP stdio)                                                */
/* ------------------------------------------------------------------ */

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleMessage(message) {
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested)
          ? requested
          : DEFAULT_PROTOCOL_VERSION;
        sendResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        });
        return;
      }
      case "ping":
        sendResult(id, {});
        return;
      case "tools/list":
        sendResult(id, { tools: TOOLS });
        return;
      case "tools/call": {
        const text = await callTool(params?.name, params?.arguments ?? {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }
      default:
        if (isNotification) return; // notifications/initialized など
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    if (isNotification) {
      process.stderr.write(`[${SERVER_NAME}] ${errorMessage(error)}\n`);
      return;
    }
    if (method === "tools/call") {
      // ツール実行の失敗はプロトコルエラーではなくツール結果として返す。
      sendResult(id, {
        content: [{ type: "text", text: `エラー: ${errorMessage(error)}` }],
        isError: true,
      });
      return;
    }
    sendError(id, -32603, errorMessage(error));
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      sendError(null, -32700, "Parse error");
      continue;
    }
    void handleMessage(message);
  }
});
process.stdin.on("end", () => process.exit(0));
