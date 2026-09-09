# multi-llm MCP サーバ

Claude Code のセッション中に **ChatGPT / Gemini / Claude** を呼び出すための stdio MCP サーバです。
「この設計、他のモデルはどう言う？」をセッションを抜けずに確認できます。

## 提供ツール

| ツール | 説明 |
| --- | --- |
| `ask_chatgpt` | ChatGPT（OpenAI Responses API）に単発で質問する |
| `ask_gemini` | Gemini（generateContent API）に単発で質問する |
| `ask_claude` | Claude（Anthropic Messages API）に単発で質問する |
| `ask_all` | 3モデルへ**並列**に同じ質問を投げ、回答を並べて返す |
| `list_models` | 各プロバイダで実際に使えるモデル ID を API から取得する |

`ask_*` の引数は `prompt`（必須）、`system`・`model`・`max_tokens`（任意）。
`ask_all` はさらに `providers` で問い合わせ先を絞れます（例 `["chatgpt", "gemini"]`）。

## セットアップ

### 1. 依存のインストール

```bash
npm install
```

`ask_claude` はリポジトリの `@anthropic-ai/sdk` を使うため、これが必要です
（`ask_chatgpt` / `ask_gemini` は fetch で REST を直接叩くので追加依存はありません）。

### 2. API キーを `.env.local` に置く

`.env*` は `.gitignore` 済みなのでコミットされません。

```dotenv
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
```

サーバ起動時にリポジトリ直下の `.env.local` → `.env` の順で読み込みます
（既に設定済みの環境変数は上書きしません）。シェルで `export` していればそれも使われます。

> **注意**: Claude Code 自体のログイン情報はこのサーバには渡りません。
> `ask_claude` を使うには `ANTHROPIC_API_KEY` を別途用意してください。

### 3. Claude Code から有効化する

リポジトリ直下の `.mcp.json` に登録済みです。Claude Code をこのリポジトリで起動すると
プロジェクトスコープの MCP サーバとして検出され、初回に承認を求められます。
`/mcp` で `multi-llm` が `connected` になっていれば成功です。

`.mcp.json` のパスは相対指定のため、リポジトリ直下以外から Claude Code を起動する場合は
`args` を絶対パスに変えてください。

## 使い方

```
/ask3 Next.js 16 の Server Actions でファイルアップロードを扱う際の定石は？
```

`/ask3` は3モデルに同じ質問を投げ、一致点・相違点・結論の形にまとめるスラッシュコマンドです
（`.claude/commands/ask3.md`）。個別に呼びたいときは普通に「ChatGPT にも聞いてみて」と
指示すれば `ask_chatgpt` が使われます。

各モデルはこのリポジトリのファイルを読めません。コードについて聞くときは、
該当箇所をプロンプトに貼り付けてから投げてください。

## 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | `ask_chatgpt` に必須 |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | — | `ask_gemini` に必須 |
| `ANTHROPIC_API_KEY` | — | `ask_claude` に必須 |
| `OPENAI_MODEL` | `gpt-5.6` | ChatGPT のモデル ID |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini のモデル ID |
| `CLAUDE_MODEL` | `claude-opus-5` | Claude のモデル ID |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | 互換 API やプロキシを使う場合 |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | 同上 |
| `MULTI_LLM_TIMEOUT_MS` | `120000` | 1リクエストのタイムアウト |

**モデル ID は各社とも頻繁に変わります。** 既定値で `model_not_found` 系のエラーが出たら、
`list_models` で現在使える ID を確認して上の環境変数で上書きしてください。

## 挙動のメモ

- `ask_all` は `Promise.allSettled` で並列実行するため、**1つ失敗しても残りの回答は返ります**。
  失敗したモデルは回答欄に `⚠️ 失敗: <理由>` として表示されます。
- API エラー・キー未設定・タイムアウトは、プロトコルエラーではなく
  `isError: true` のツール結果として返します（Claude Code 側で読めて対処できるように）。
- stdout は JSON-RPC 専用です。デバッグ出力を足す場合は必ず `process.stderr` へ。
