// 予定の位置情報から「前後の予定の間に挟む移動時間ブロック」を組み立てる純粋ロジック。
// Google カレンダー連携（app/lib/google.ts）と自動同期（app/api/calendar/sync）から利用する。

export interface CalEvent {
  id: string;
  summary: string;
  location?: string;
  start: string; // ISO 8601（タイムゾーン付き）
  end: string; // ISO 8601
  isAutoTravel?: boolean; // このアプリが作成した移動ブロックか
  forEventId?: string; // 移動ブロックが紐づく「到着先」予定のID
}

export interface TravelLeg {
  from: CalEvent;
  to: CalEvent;
}

function norm(s?: string): string {
  return (s ?? "").trim().toLowerCase();
}

// ISO 8601 の日付部分（"YYYY-MM-DD"）を、そのイベント自身のタイムゾーンオフセットのまま取り出す。
// UTC変換すると日付がずれることがあるため、文字列の先頭10文字をそのまま使う。
function localDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * 場所を持つ実予定を開始時刻順に並べ、隣り合う（同じ日・場所が異なる）ペアを列挙する。
 * 日をまたぐ予定同士や、自動生成した移動ブロック自体は対象から除外する。
 * homeLocation を指定すると、各日の最初の予定の前に「自宅」からの移動も対象に加える。
 */
export function travelLegs(events: CalEvent[], homeLocation?: string): TravelLeg[] {
  const real = events
    .filter((e) => !e.isAutoTravel && norm(e.location))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const withHome: CalEvent[] = [];
  if (homeLocation?.trim()) {
    let lastDateKey: string | null = null;
    for (const e of real) {
      const dateKey = localDateKey(e.start);
      if (dateKey !== lastDateKey) {
        withHome.push({
          id: `home:${dateKey}`,
          summary: "自宅",
          location: homeLocation,
          start: e.start,
          end: e.start,
        });
        lastDateKey = dateKey;
      }
      withHome.push(e);
    }
  } else {
    withHome.push(...real);
  }

  const legs: TravelLeg[] = [];
  for (let i = 0; i < withHome.length - 1; i++) {
    const from = withHome[i];
    const to = withHome[i + 1];
    if (localDateKey(from.start) !== localDateKey(to.start)) continue; // 日をまたぐ場合は移動を作らない
    if (norm(from.location) === norm(to.location)) continue; // 同じ場所なら移動不要
    legs.push({ from, to });
  }
  return legs;
}

/**
 * 到着先予定の開始時刻から移動時間を逆算した、移動ブロックの開始・終了時刻。
 */
export function blockTimes(
  toStart: string,
  minutes: number
): { start: string; end: string } {
  const arrival = new Date(toStart);
  const departure = new Date(arrival.getTime() - minutes * 60_000);
  return { start: departure.toISOString(), end: arrival.toISOString() };
}

export interface PlannedBlock {
  forEventId: string;
  summary: string;
  location?: string;
  start: string;
  end: string;
  minutes: number;
  note: string;
}

/**
 * 各区間の移動時間（分）を解決する関数を受け取り、作成すべき移動ブロックを組み立てる。
 * minutes が 0 以下の区間はブロックを作らない（同一地点や解決失敗）。
 */
export async function planTravelBlocks(
  events: CalEvent[],
  resolveMinutes: (
    from: string,
    to: string
  ) => Promise<{ minutes: number; note: string }>,
  homeLocation?: string
): Promise<PlannedBlock[]> {
  const legs = travelLegs(events, homeLocation);
  const blocks: PlannedBlock[] = [];
  for (const leg of legs) {
    const { minutes, note } = await resolveMinutes(
      leg.from.location as string,
      leg.to.location as string
    );
    if (!minutes || minutes <= 0) continue;
    const { start, end } = blockTimes(leg.to.start, minutes);
    blocks.push({
      forEventId: leg.to.id,
      summary: `🚃 移動: ${leg.from.location} → ${leg.to.location}`,
      location: leg.from.location,
      start,
      end,
      minutes,
      note,
    });
  }
  return blocks;
}

export interface SyncPlan {
  create: PlannedBlock[];
  update: { existing: CalEvent; block: PlannedBlock }[];
  delete: CalEvent[];
}

/**
 * 望ましい移動ブロック（desired）と、既存の自動移動ブロック（existingAuto）を突き合わせ、
 * 作成 / 更新 / 削除に振り分ける。forEventId をキーに冪等化し、再実行で重複しないようにする。
 */
export function reconcile(
  desired: PlannedBlock[],
  existingAuto: CalEvent[]
): SyncPlan {
  const byTarget = new Map<string, CalEvent>();
  for (const e of existingAuto) {
    if (e.forEventId) byTarget.set(e.forEventId, e);
  }

  const create: PlannedBlock[] = [];
  const update: { existing: CalEvent; block: PlannedBlock }[] = [];
  const keep = new Set<string>();

  for (const block of desired) {
    const existing = byTarget.get(block.forEventId);
    if (!existing) {
      create.push(block);
      continue;
    }
    keep.add(block.forEventId);
    if (
      existing.start !== block.start ||
      existing.end !== block.end ||
      existing.summary !== block.summary
    ) {
      update.push({ existing, block });
    }
  }

  const del = existingAuto.filter(
    (e) => e.forEventId && !keep.has(e.forEventId) && !inDesired(e, desired)
  );

  return { create, update, delete: del };
}

function inDesired(e: CalEvent, desired: PlannedBlock[]): boolean {
  return desired.some((b) => b.forEventId === e.forEventId);
}
