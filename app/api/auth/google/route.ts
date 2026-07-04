import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAuthUrl } from "@/app/lib/google";

export async function GET() {
  try {
    const state = randomBytes(16).toString("hex");
    const jar = await cookies();
    jar.set("g_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return NextResponse.redirect(getAuthUrl(state));
  } catch (error) {
    console.error("OAuth start error:", error);
    return NextResponse.json(
      { error: "Google連携の設定が未完了です（環境変数を確認してください）" },
      { status: 500 }
    );
  }
}
