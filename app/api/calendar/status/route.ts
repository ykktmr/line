import { NextResponse } from "next/server";
import { isConnected } from "@/app/lib/google";

export async function GET() {
  try {
    const connected = await isConnected();
    const configured = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.APP_BASE_URL
    );
    return NextResponse.json({ connected, configured });
  } catch {
    return NextResponse.json({ connected: false, configured: false });
  }
}
