import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

const modeLabel: Record<string, string> = {
  train: "電車・公共交通機関",
  car: "車",
  walk: "徒歩",
  bike: "自転車",
};

export async function POST(req: NextRequest) {
  try {
    const { origin, destination, mode } = await req.json();

    if (!origin?.trim() || !destination?.trim()) {
      return NextResponse.json(
        { error: "出発地と目的地を入力してください" },
        { status: 400 }
      );
    }

    const prompt = `あなたは移動時間の見積もりの専門家です。
以下の移動にかかる片道の所要時間を、一般的な知識にもとづいて推定してください。

出発地: ${origin}
目的地: ${destination}
移動手段: ${modeLabel[mode] ?? mode}

要件:
- 混雑や乗り換え、信号待ちなど現実的な条件を考慮したドアtoドアの目安
- 正確な経路検索はできないため、あくまで概算でよい
- minutes は片道の所要時間（分）を整数で
- note は「乗り換え2回・徒歩含む」など、推定の根拠を20文字程度で簡潔に

以下のJSON形式で返してください（他のテキストは一切含めないこと）:
{
  "minutes": 45,
  "note": "推定の根拠を簡潔に"
}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const jsonText = content.text
      .trim()
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");
    const parsed = JSON.parse(jsonText);

    const minutes = Math.max(1, Math.round(Number(parsed.minutes)));
    if (!Number.isFinite(minutes)) {
      throw new Error("Invalid minutes");
    }

    return NextResponse.json({ minutes, note: parsed.note ?? "" });
  } catch (error) {
    console.error("Schedule API error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "AIの返答の解析に失敗しました。再試行してください。" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "移動時間の推定に失敗しました。再試行してください。" },
      { status: 500 }
    );
  }
}
