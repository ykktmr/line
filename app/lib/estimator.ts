// 2地点間の片道移動時間（分）を推定する。
// GOOGLE_MAPS_API_KEY があれば Distance Matrix API を使い、なければ Claude で概算する。

import Anthropic from "@anthropic-ai/sdk";

export type TravelMode = "train" | "car" | "walk" | "bike";

export const modeLabel: Record<TravelMode, string> = {
  train: "電車・公共交通機関",
  car: "車",
  walk: "徒歩",
  bike: "自転車",
};

const mapsMode: Record<TravelMode, string> = {
  train: "transit",
  car: "driving",
  walk: "walking",
  bike: "bicycling",
};

export interface Estimate {
  minutes: number;
  note: string;
}

export function defaultMode(): TravelMode {
  const m = process.env.TRAVEL_MODE as TravelMode | undefined;
  return m && m in modeLabel ? m : "train";
}

async function estimateWithMaps(
  from: string,
  to: string,
  mode: TravelMode,
  apiKey: string
): Promise<Estimate | null> {
  const q = new URLSearchParams({
    origins: from,
    destinations: to,
    mode: mapsMode[mode],
    language: "ja",
    key: apiKey,
  });
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/distancematrix/json?${q}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    rows?: { elements?: { status: string; duration?: { value: number } }[] }[];
  };
  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== "OK" || !el.duration) return null;
  return {
    minutes: Math.max(1, Math.round(el.duration.value / 60)),
    note: "Google マップの経路にもとづく",
  };
}

let anthropic: Anthropic | null = null;

async function estimateWithAI(
  from: string,
  to: string,
  mode: TravelMode
): Promise<Estimate> {
  if (!anthropic) anthropic = new Anthropic();
  const prompt = `あなたは移動時間の見積もりの専門家です。
以下の移動にかかる片道の所要時間を、一般的な知識にもとづいて推定してください。

出発地: ${from}
目的地: ${to}
移動手段: ${modeLabel[mode]}

要件:
- 混雑や乗り換え、信号待ちなど現実的な条件を考慮したドアtoドアの目安
- 正確な経路検索はできないため、あくまで概算でよい
- 出発地と目的地が実質同じ場所なら minutes は 0
- minutes は片道の所要時間（分）を整数で
- note は推定の根拠を20文字程度で簡潔に

以下のJSON形式で返してください（他のテキストは一切含めないこと）:
{ "minutes": 45, "note": "推定の根拠を簡潔に" }`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });
  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  const jsonText = content.text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "");
  const parsed = JSON.parse(jsonText) as { minutes?: number; note?: string };
  const minutes = Math.max(0, Math.round(Number(parsed.minutes)));
  return {
    minutes: Number.isFinite(minutes) ? minutes : 0,
    note: parsed.note ?? "",
  };
}

export async function estimateTravel(
  from: string,
  to: string,
  mode: TravelMode = defaultMode()
): Promise<Estimate> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    const viaMaps = await estimateWithMaps(from, to, mode, key);
    if (viaMaps) return viaMaps;
  }
  return estimateWithAI(from, to, mode);
}
