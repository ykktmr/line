import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { recipient, tone, keywords } = await req.json();

    if (!keywords?.trim()) {
      return NextResponse.json(
        { error: "伝えたい内容を入力してください" },
        { status: 400 }
      );
    }

    const toneGuide: Record<string, string> = {
      casual: "カジュアルで親しみやすい口語体。絵文字を適度に使ってOK。",
      polite: "丁寧だが堅すぎない。「です・ます」調で温かみのある表現。",
      business: "ビジネス向けの敬語。礼儀正しく簡潔に。絵文字は使わない。",
    };

    const recipientLabel: Record<string, string> = {
      friend: "友人・知人",
      boss: "上司・先輩",
      client: "取引先・お客様",
      family: "家族",
    };

    const prompt = `あなたはLINEメッセージの文章作成の専門家です。
以下の条件でLINEメッセージの文章案を3つ作成してください。

送信相手: ${recipientLabel[recipient] ?? recipient}
トーン: ${toneGuide[tone] ?? tone}
伝えたい内容・キーワード: ${keywords}

要件:
- LINEらしい自然な日本語の口語文
- 長すぎず、読みやすい長さ（50〜150文字程度）
- 3つのバリエーションは少しずつニュアンスや表現を変える
- 番号や説明は不要。文章のみを返す

以下のJSON形式で返してください（他のテキストは一切含めないこと）:
{
  "drafts": [
    "文章案1",
    "文章案2",
    "文章案3"
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

    const jsonText = content.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(jsonText);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Draft API error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "AIの返答の解析に失敗しました。再試行してください。" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "メッセージの生成に失敗しました。再試行してください。" },
      { status: 500 }
    );
  }
}
