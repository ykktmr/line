// Google OAuth 2.0 と Calendar API を fetch で薄くラップする（googleapis 依存は増やさない）。
// 必要な環境変数:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   APP_BASE_URL            例: https://your-app.vercel.app（OAuth リダイレクト / Webhook のベース）
// 任意:
//   GOOGLE_CALENDAR_ID      既定 "primary"

import { getTokenStore, StoredTokens } from "./tokenStore";
import type { CalEvent } from "./travel";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
// events の読み書きに必要な最小スコープ
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function appBaseUrl(): string {
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error("APP_BASE_URL is not set");
  return base.replace(/\/$/, "");
}

export function redirectUri(): string {
  return `${appBaseUrl()}/api/auth/google/callback`;
}

export function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID ?? "primary";
}

function clientCredentials(): { id: string; secret: string } {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is not set");
  }
  return { id, secret };
}

export function getAuthUrl(state: string): string {
  const { id } = clientCredentials();
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // refresh_token を得る
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export async function exchangeCode(code: string): Promise<StoredTokens> {
  const { id, secret } = clientCredentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.refresh_token) {
    throw new Error("No refresh_token returned (再連携が必要な場合があります)");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refresh(refreshToken: string): Promise<StoredTokens> {
  const { id, secret } = clientCredentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken, // refresh 時は返らないので使い回す
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/** 有効なアクセストークンを返す。期限切れ間近なら自動更新して保存する。 */
export async function getAccessToken(): Promise<string | null> {
  const store = getTokenStore();
  const data = await store.read();
  if (!data.tokens) return null;

  // 60 秒の余裕を持って更新
  if (data.tokens.expiresAt - 60_000 > Date.now()) {
    return data.tokens.accessToken;
  }
  const refreshed = await refresh(data.tokens.refreshToken);
  await store.write({ ...data, tokens: refreshed });
  return refreshed.accessToken;
}

export async function isConnected(): Promise<boolean> {
  const data = await getTokenStore().read();
  return Boolean(data.tokens?.refreshToken);
}

// ---- Calendar API ----

interface GEvent {
  id: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

const AUTO_FLAG = "lineTravelAuto";
const FOR_EVENT = "lineTravelForEvent";

function toCalEvent(e: GEvent): CalEvent | null {
  const start = e.start?.dateTime ?? e.start?.date;
  const end = e.end?.dateTime ?? e.end?.date;
  if (!start || !end) return null; // 終日/不完全な予定は対象外
  const priv = e.extendedProperties?.private ?? {};
  return {
    id: e.id,
    summary: e.summary ?? "",
    location: e.location,
    start,
    end,
    isAutoTravel: priv[AUTO_FLAG] === "1",
    forEventId: priv[FOR_EVENT],
  };
}

export async function listEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalEvent[]> {
  const q = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId())}/events?${q}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`listEvents failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { items?: GEvent[] };
  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map(toCalEvent)
    .filter((e): e is CalEvent => e !== null);
}

interface UpsertInput {
  summary: string;
  location?: string;
  start: string; // ISO
  end: string;
  forEventId: string;
  description?: string;
}

function eventBody(input: UpsertInput) {
  return {
    summary: input.summary,
    location: input.location,
    description: input.description,
    start: { dateTime: input.start },
    end: { dateTime: input.end },
    reminders: { useDefault: false },
    extendedProperties: {
      private: { [AUTO_FLAG]: "1", [FOR_EVENT]: input.forEventId },
    },
  };
}

export async function insertEvent(
  accessToken: string,
  input: UpsertInput
): Promise<void> {
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId())}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody(input)),
    }
  );
  if (!res.ok) {
    throw new Error(`insertEvent failed: ${res.status} ${await res.text()}`);
  }
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  input: UpsertInput
): Promise<void> {
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(
      calendarId()
    )}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody(input)),
    }
  );
  if (!res.ok) {
    throw new Error(`updateEvent failed: ${res.status} ${await res.text()}`);
  }
}

export async function deleteEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(
      calendarId()
    )}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  // 既に消えている場合の 410/404 は許容
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`deleteEvent failed: ${res.status} ${await res.text()}`);
  }
}

/** Push 通知チャンネルを登録する。expiration(epoch ms) を返す。 */
export async function watchCalendar(
  accessToken: string,
  channelId: string
): Promise<{ resourceId: string; expiration: number }> {
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId())}/events/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: `${appBaseUrl()}/api/calendar/notifications`,
        token: process.env.WEBHOOK_TOKEN ?? undefined,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`watch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { resourceId: string; expiration: string };
  return {
    resourceId: data.resourceId,
    expiration: Number(data.expiration),
  };
}

export async function stopChannel(
  accessToken: string,
  channelId: string,
  resourceId: string
): Promise<void> {
  await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}
