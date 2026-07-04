"use client";

import { useMemo, useState } from "react";

interface Estimate {
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

export function ScheduleForm() {
  const [title, setTitle] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [arrival, setArrival] = useState("");
  const [mode, setMode] = useState("train");
  const [duration, setDuration] = useState(60);

  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setEstimate(null);

    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
      } else {
        setEstimate(data);
        setMinutes(data.minutes);
      }
    } catch {
      setError("通信エラーが発生しました。再試行してください。");
    } finally {
      setLoading(false);
    }
  };

  const arrivalDate = useMemo(
    () => (arrival ? new Date(arrival) : null),
    [arrival]
  );

  const departureDate = useMemo(() => {
    if (!arrivalDate) return null;
    return new Date(arrivalDate.getTime() - minutes * 60_000);
  }, [arrivalDate, minutes]);

  const travelUrl = useMemo(() => {
    if (!arrivalDate || !departureDate) return null;
    return buildGCalUrl({
      title: `🚃 移動: ${origin} → ${destination}`,
      start: departureDate,
      end: arrivalDate,
      details: `${modes.find((m) => m.value === mode)?.label ?? mode}での移動（約${minutes}分）${estimate?.note ? `\n${estimate.note}` : ""}`,
      location: origin,
    });
  }, [arrivalDate, departureDate, origin, destination, mode, minutes, estimate]);

  const eventUrl = useMemo(() => {
    if (!arrivalDate) return null;
    return buildGCalUrl({
      title: title || "予定",
      start: arrivalDate,
      end: new Date(arrivalDate.getTime() + duration * 60_000),
      location: destination,
    });
  }, [arrivalDate, title, duration, destination]);

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            予定のタイトル
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：打ち合わせ"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              出発地
            </label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="例：横浜駅"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              目的地
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="例：渋谷駅"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            移動手段
          </label>
          <div className="flex gap-2">
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
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

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              到着したい日時
            </label>
            <input
              type="datetime-local"
              value={arrival}
              onChange={(e) => setArrival(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              required
            />
          </div>
          <div className="w-24">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              予定の長さ
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              {[30, 60, 90, 120, 180].map((d) => (
                <option key={d} value={d}>
                  {d}分
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !origin.trim() || !destination.trim() || !arrival}
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

      {estimate && arrivalDate && departureDate && (
        <div className="mt-5 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">
                推定移動時間
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <span className="text-sm text-gray-600">分</span>
              </div>
            </div>
            {estimate.note && (
              <p className="text-xs text-gray-500 mb-3">💡 {estimate.note}</p>
            )}
            <div className="flex items-center justify-between text-sm bg-gray-50 rounded-xl px-3 py-2">
              <div className="text-center">
                <p className="text-xs text-gray-400">出発</p>
                <p className="font-semibold text-gray-800">
                  {formatTime(departureDate)}
                </p>
              </div>
              <span className="text-gray-300">──▶</span>
              <div className="text-center">
                <p className="text-xs text-gray-400">到着</p>
                <p className="font-semibold text-gray-800">
                  {formatTime(arrivalDate)}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 text-center">
              ※ AIによる概算です。正確な時間は経路検索でご確認ください
            </p>
          </div>

          <div className="space-y-2">
            {travelUrl && (
              <a
                href={travelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-xl text-white font-bold text-sm text-center transition-all"
                style={{ backgroundColor: "#4285F4" }}
              >
                🚃 移動時間をGoogleカレンダーに追加
              </a>
            )}
            {eventUrl && (
              <a
                href={eventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-xl font-bold text-sm text-center border transition-all"
                style={{ borderColor: "#4285F4", color: "#4285F4" }}
              >
                🗓️ 予定「{title || "予定"}」をカレンダーに追加
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
