"use client";

import { useMemo, useState } from "react";

interface Stop {
  title: string;
  location: string;
  time: string; // datetime-local
}

interface Segment {
  minutes: number;
  note: string;
}

const modes = [
  { value: "train", label: "🚃 電車" },
  { value: "car", label: "🚗 車" },
  { value: "walk", label: "🚶 徒歩" },
  { value: "bike", label: "🚲 自転車" },
];

// Google カレンダーの TEMPLATE URL 用に UTC の YYYYMMDDTHHmmSSZ 形式へ整形
function formatGCalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildGCalUrl(params: {
  title: string;
  start: Date;
  end: Date;
  details?: string;
  location?: string;
}): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${formatGCalDate(params.start)}/${formatGCalDate(params.end)}`,
  });
  if (params.details) q.set("details", params.details);
  if (params.location) q.set("location", params.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

function formatTime(d: Date): string {
  return d.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const emptyStop = (): Stop => ({ title: "", location: "", time: "" });

export function ScheduleForm() {
  const [stops, setStops] = useState<Stop[]>([emptyStop(), emptyStop()]);
  const [mode, setMode] = useState("train");
  const [loading, setLoading] = useState(false);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateStop = (i: number, patch: Partial<Stop>) => {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setSegments(null);
  };

  const addStop = () => {
    setStops((prev) => [...prev, emptyStop()]);
    setSegments(null);
  };

  const removeStop = (i: number) => {
    setStops((prev) => prev.filter((_, idx) => idx !== i));
    setSegments(null);
  };

  const setSegmentMinutes = (i: number, minutes: number) => {
    setSegments((prev) =>
      prev ? prev.map((s, idx) => (idx === i ? { ...s, minutes } : s)) : prev
    );
  };

  const canSubmit =
    stops.length >= 2 &&
    stops.every((s) => s.location.trim() && s.time) &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSegments(null);

    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stops: stops.map((s) => ({ title: s.title, location: s.location })),
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
      } else {
        setSegments(data.segments);
      }
    } catch {
      setError("通信エラーが発生しました。再試行してください。");
    } finally {
      setLoading(false);
    }
  };

  const modeLabel = modes.find((m) => m.value === mode)?.label ?? mode;

  // 各区間について、次の予定の開始時刻から移動時間を逆算した出発時刻とカレンダーURLを算出
  const travelBlocks = useMemo(() => {
    if (!segments) return [];
    return segments.map((seg, i) => {
      const from = stops[i];
      const to = stops[i + 1];
      const arrival = to?.time ? new Date(to.time) : null;
      const departure = arrival
        ? new Date(arrival.getTime() - seg.minutes * 60_000)
        : null;
      const url =
        arrival && departure && seg.minutes > 0
          ? buildGCalUrl({
              title: `🚃 移動: ${from.location} → ${to.location}`,
              start: departure,
              end: arrival,
              details: `${modeLabel}での移動（約${seg.minutes}分）${seg.note ? `\n${seg.note}` : ""}`,
              location: from.location,
            })
          : null;
      return { seg, from, to, arrival, departure, url };
    });
  }, [segments, stops, modeLabel]);

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            移動手段
          </label>
          <div className="flex gap-2">
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => {
                  setMode(m.value);
                  setSegments(null);
                }}
                className="flex-1 py-2 rounded-xl text-xs font-medium border transition-all"
                style={{
                  backgroundColor: mode === m.value ? "#06C755" : "white",
                  color: mode === m.value ? "white" : "#555",
                  borderColor: mode === m.value ? "#06C755" : "#ddd",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            その日の予定（訪れる順に入力）
          </label>
          {stops.map((stop, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 p-3 space-y-2 relative"
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "#06C755", color: "white" }}
                >
                  {i + 1}
                </span>
                <input
                  type="text"
                  value={stop.title}
                  onChange={(e) => updateStop(i, { title: e.target.value })}
                  placeholder="予定名（例：打ち合わせ）"
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                {stops.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeStop(i)}
                    className="text-gray-400 hover:text-red-500 text-lg leading-none px-1"
                    aria-label="削除"
                  >
                    ×
                  </button>
                )}
              </div>
              <input
                type="text"
                value={stop.location}
                onChange={(e) => updateStop(i, { location: e.target.value })}
                placeholder="場所（例：渋谷駅）"
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                required
              />
              <input
                type="datetime-local"
                value={stop.time}
                onChange={(e) => updateStop(i, { time: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                required
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addStop}
            className="w-full py-2 rounded-xl text-sm font-medium border border-dashed transition-all"
            style={{ borderColor: "#06C755", color: "#06C755" }}
          >
            ＋ 予定を追加
          </button>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
          style={{ backgroundColor: "#06C755" }}
        >
          {loading ? "計算中..." : "移動時間を計算する"}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {segments && (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium text-gray-600">
            予定の間に挟む移動時間
          </p>
          {travelBlocks.map(({ seg, from, to, arrival, departure, url }, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
            >
              <p className="text-sm font-semibold text-gray-800 mb-2">
                {from.location} → {to.location}
              </p>
              {seg.minutes === 0 ? (
                <p className="text-xs text-gray-500">
                  同じ場所のため移動なし
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">推定移動時間</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={seg.minutes}
                        onChange={(e) =>
                          setSegmentMinutes(i, Math.max(0, Number(e.target.value)))
                        }
                        className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <span className="text-sm text-gray-600">分</span>
                    </div>
                  </div>
                  {seg.note && (
                    <p className="text-xs text-gray-500 mb-2">💡 {seg.note}</p>
                  )}
                  {departure && arrival && (
                    <div className="flex items-center justify-between text-sm bg-gray-50 rounded-xl px-3 py-2 mb-3">
                      <div className="text-center">
                        <p className="text-xs text-gray-400">出発</p>
                        <p className="font-semibold text-gray-800">
                          {formatTime(departure)}
                        </p>
                      </div>
                      <span className="text-gray-300">──▶</span>
                      <div className="text-center">
                        <p className="text-xs text-gray-400">到着</p>
                        <p className="font-semibold text-gray-800">
                          {formatTime(arrival)}
                        </p>
                      </div>
                    </div>
                  )}
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full py-2.5 rounded-xl text-white font-bold text-sm text-center transition-all"
                      style={{ backgroundColor: "#4285F4" }}
                    >
                      🚃 移動時間をGoogleカレンダーに追加
                    </a>
                  )}
                </>
              )}
            </div>
          ))}
          <p className="text-[11px] text-gray-400 text-center">
            ※ AIによる概算です。正確な時間は経路検索でご確認ください
          </p>
        </div>
      )}
    </div>
  );
}
