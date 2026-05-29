import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "添削するメッセージを入力してください" },
        { status: 400 }
      );
    }

    const prompt = `あなたはLINEメッセージの文章添削の専門家です。
以下のLINEメッセージを分析し、改善案を提案してください。

元のメッセージ:
「${message}」

以下の観点で添削してください:
1. 改善点・フィードバック（簡潔に）
2. ワントーン上げた版（より丁寧・フォーマルに）
3. ワントーン下げた版（よりカジュアル・フレンドリーに）
4. 全体的に改善した推奨版

以下のJSON形式で返してください（他のテキストは一切含めないこと）:
{
  "feedback": "改善点・フィードバックのテキスト",
  "formal": "ワントーン上げた版",
  "casual": "ワントーン下げた版",
  "recommended": "推奨改善版"
}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const jsonText = content.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(jsonText);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Review API error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "AIの返答の解析に失敗しました。再試行してください。" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "添削に失敗しました。再試行してください。" },
      { status: 500 }
    );
  }
}
