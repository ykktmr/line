import { NextResponse } from "next/server";
import { getAccessToken, stopChannel } from "@/app/lib/google";
import { getTokenStore } from "@/app/lib/tokenStore";

export async function POST() {
  try {
    const store = getTokenStore();
    const data = await store.read();
    // Push チャンネルを停止（ベストエフォート）
    if (data.watch) {
      const token = await getAccessToken().catch(() => null);
      if (token) {
        await stopChannel(
          token,
          data.watch.channelId,
          data.watch.resourceId
        ).catch(() => {});
      }
    }
    await store.clear();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("disconnect error:", error);
    return NextResponse.json({ error: "解除に失敗しました" }, { status: 500 });
  }
}
