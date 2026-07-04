import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAccessToken, watchCalendar, stopChannel } from "@/app/lib/google";
import { getTokenStore } from "@/app/lib/tokenStore";

// Push 通知チャンネルは最長 7 日で失効するため、cron で定期的に貼り直す。
// Authorization: Bearer <CRON_SECRET> が必要（設定時）。
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "未連携" }, { status: 400 });
  }
  try {
    const store = getTokenStore();
    const data = await store.read();

    // 期限に余裕がある（1日以上）なら貼り直さない
    if (data.watch && data.watch.expiration - Date.now() > 24 * 60 * 60_000) {
      return NextResponse.json({ ok: true, renewed: false });
    }

    // 既存チャンネルを停止してから新規登録
    if (data.watch) {
      await stopChannel(
        accessToken,
        data.watch.channelId,
        data.watch.resourceId
      ).catch(() => {});
    }
    const channelId = randomBytes(16).toString("hex");
    const { resourceId, expiration } = await watchCalendar(
      accessToken,
      channelId
    );
    await store.write({
      ...(await store.read()),
      watch: { channelId, resourceId, expiration },
    });
    return NextResponse.json({ ok: true, renewed: true, expiration });
  } catch (error) {
    console.error("watch renew error:", error);
    return NextResponse.json({ error: "watch更新に失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
