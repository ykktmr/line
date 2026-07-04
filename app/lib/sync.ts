// Google カレンダーを読み取り、予定の間に移動時間ブロックを挿入/更新/削除する同期処理。
// Webhook（app/api/calendar/notifications）と手動/cron 同期（app/api/calendar/sync）の両方から呼ぶ。

import {
  getAccessToken,
  listEvents,
  insertEvent,
  updateEvent,
  deleteEvent,
} from "./google";
import { defaultMode, estimateTravel } from "./estimator";
import { planTravelBlocks, reconcile } from "./travel";

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
}

/**
 * 今から daysAhead 日先までの予定を対象に、移動ブロックを同期する。
 * 冪等：既存の自動ブロックを見て、必要な差分だけを反映する。
 */
export async function runSync(daysAhead = 7): Promise<SyncResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Google カレンダー未連携");

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(
    now.getTime() + daysAhead * 24 * 60 * 60_000
  ).toISOString();

  const events = await listEvents(accessToken, timeMin, timeMax);
  const mode = defaultMode();

  const maxGapMultiplier = Number(process.env.MAX_GAP_MULTIPLIER ?? 2);

  const desired = await planTravelBlocks(
    events,
    (from, to) => estimateTravel(from, to, mode),
    process.env.HOME_LOCATION,
    maxGapMultiplier
  );

  const existingAuto = events.filter((e) => e.isAutoTravel);
  const plan = reconcile(desired, existingAuto);

  for (const block of plan.create) {
    await insertEvent(accessToken, {
      summary: block.summary,
      location: block.location,
      start: block.start,
      end: block.end,
      forEventId: block.forEventId,
      description: `${block.minutes}分の移動（自動追加）${block.note ? `\n${block.note}` : ""}`,
    });
  }

  for (const { existing, block } of plan.update) {
    await updateEvent(accessToken, existing.id, {
      summary: block.summary,
      location: block.location,
      start: block.start,
      end: block.end,
      forEventId: block.forEventId,
      description: `${block.minutes}分の移動（自動追加）${block.note ? `\n${block.note}` : ""}`,
    });
  }

  for (const e of plan.delete) {
    await deleteEvent(accessToken, e.id);
  }

  return {
    created: plan.create.length,
    updated: plan.update.length,
    deleted: plan.delete.length,
  };
}
