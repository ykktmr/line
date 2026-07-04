import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/app/lib/sync";
import { isConnected } from "@/app/lib/google";

// Google Calendar の Push 通知（watch チャンネル）の受け口。
// 予定が変更されると Google がここに POST してくるので、同期を実行する。
export async function POST(req: NextRequest) {
  // 任意トークンで正当性を確認（watchCalendar で token を設定した場合）
  const expected = process.env.WEBHOOK_TOKEN;
  if (expected && req.headers.get("x-goog-channel-token") !== expected) {
    return new NextResponse(null, { status: 401 });
  }

  const state = req.headers.get("x-goog-resource-state");
  // 初回同期確認（sync）は無視。実変更（exists）のときだけ処理。
  if (state === "sync") {
    return new NextResponse(null, { status: 200 });
  }

  try {
    if (await isConnected()) {
      const daysAhead = Number(process.env.SYNC_DAYS_AHEAD ?? 7);
      await runSync(daysAhead);
    }
  } catch (error) {
    // Google には 200 を返し、リトライ嵐を避ける（内部でログ）
    console.error("Notification sync error:", error);
  }
  return new NextResponse(null, { status: 200 });
}
