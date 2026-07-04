import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/app/lib/sync";
import { isConnected } from "@/app/lib/google";

// 手動（UIの「今すぐ同期」）および cron から呼ぶ。
// cron から呼ぶ場合は Authorization: Bearer <CRON_SECRET> を付ける。
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 未設定なら保護しない（自己ホスト想定）
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await isConnected())) {
    return NextResponse.json(
      { error: "Google カレンダー未連携" },
      { status: 400 }
    );
  }
  try {
    const daysAhead = Number(process.env.SYNC_DAYS_AHEAD ?? 7);
    const result = await runSync(daysAhead);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "同期に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// cron からの GET も許容
export async function GET(req: NextRequest) {
  return handle(req);
}
