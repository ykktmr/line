import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  appBaseUrl,
  exchangeCode,
  watchCalendar,
} from "@/app/lib/google";
import { getTokenStore } from "@/app/lib/tokenStore";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const back = (params: string) =>
    NextResponse.redirect(`${appBaseUrl()}/?${params}`);

  if (errorParam) {
    return back(`gc=denied`);
  }

  const jar = await cookies();
  const expected = jar.get("g_oauth_state")?.value;
  jar.delete("g_oauth_state");

  if (!code || !state || !expected || state !== expected) {
    return back(`gc=invalid`);
  }

  try {
    const tokens = await exchangeCode(code);
    const store = getTokenStore();
    const current = await store.read();
    await store.write({ ...current, tokens });

    // Push 通知チャンネルを登録（失敗しても連携自体は成功扱い）
    try {
      const channelId = randomBytes(16).toString("hex");
      const { resourceId, expiration } = await watchCalendar(
        tokens.accessToken,
        channelId
      );
      await store.write({
        ...(await store.read()),
        watch: { channelId, resourceId, expiration },
      });
    } catch (e) {
      console.error("watch registration failed:", e);
    }

    return back(`gc=connected`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return back(`gc=error`);
  }
}
