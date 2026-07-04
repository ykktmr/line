import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

const modeLabel: Record<string, string> = {
  train: "電車・公共交通機関",
  car: "車",
  walk: "徒歩",
  bike: "自転車",
};

interface Stop {
  title?: string;
  location?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { stops, mode } = await req.json();

    if (!Array.isArray(stops) || stops.length < 2) {
      return NextResponse.json(
        { error: "場所を2件以上入力してください" },
        { status: 400 }
      );
    }

    const located: Stop[] = stops;
    if (located.some((s) => !s?.location?.trim())) {
      return NextResponse.json(
        { error: "すべての予定に場所を入力してください" },
        { status: 400 }
      );
    }

    const legList = located
      .slice(0, -1)
      .map(
        (s, i) =>
          `${i + 1}. ${s.location} → ${located[i + 1].location}`
      )
      .join("\n");

    const prompt = `あなたは移動時間の見積もりの専門家です。
1日の予定を順番にまわるときの、各区間の片道移動時間を一般的な知識にもとづいて推定してください。

移動手段: ${modeLabel[mode] ?? mode}

区間一覧:
${legList}

要件:
- 混雑や乗り換え、信号待ちなど現実的な条件を考慮したドアtoドアの目安
- 正確な経路検索はできないため、あくまで概算でよい
- 出発地と目的地が実質同じ場所なら minutes は 0 でよい
- minutes は片道の所要時間（分）を整数で
- note は「乗り換え2回・徒歩含む」など、推定の根拠を20文字程度で簡潔に
- segments は区間一覧と同じ順序・同じ件数にすること

以下のJSON形式で返してください（他のテキストは一切含めないこと）:
{
  "segments": [
    { "minutes": 45, "note": "推定の根拠を簡潔に" }
  ]
}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
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

    if (!Array.isArray(parsed.segments)) {
      throw new Error("Invalid segments");
    }

    const segments = parsed.segments
      .slice(0, located.length - 1)
      .map((s: { minutes?: number; note?: string }) => {
        const minutes = Math.max(0, Math.round(Number(s.minutes)));
        return {
          minutes: Number.isFinite(minutes) ? minutes : 0,
          note: s.note ?? "",
        };
      });

    return NextResponse.json({ segments });
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
