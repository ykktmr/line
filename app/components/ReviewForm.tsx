"use client";

import { useState } from "react";
import { CopyButton } from "./CopyButton";

interface ReviewResult {
  feedback: string;
  formal: string;
  casual: string;
  recommended: string;
}

export function ReviewForm() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
      } else {
        setResult(data);
      }
    } catch {
      setError("通信エラーが発生しました。再試行してください。");
    } finally {
      setLoading(false);
    }
  };

  const suggestions = result
    ? [
        { label: "推奨改善版", text: result.recommended, highlight: true },
        { label: "ワントーン上げ（より丁寧に）", text: result.formal, highlight: false },
        { label: "ワントーン下げ（よりカジュアルに）", text: result.casual, highlight: false },
      ]
    : [];

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            添削したいメッセージ
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="添削したいLINEメッセージをここに貼り付けてください"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            rows={5}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
          style={{ backgroundColor: "#06C755" }}
        >
          {loading ? "添削中..." : "添削する"}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs font-semibold text-amber-700 mb-1">フィードバック</p>
            <p className="text-sm text-amber-900 leading-relaxed">{result.feedback}</p>
          </div>

          {suggestions.map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-2xl p-4 shadow-sm border"
              style={{ borderColor: s.highlight ? "#06C755" : "#f0f0f0" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-semibold"
                  style={{ color: s.highlight ? "#06C755" : "#888" }}
                >
                  {s.highlight && "⭐ "}{s.label}
                </span>
                <CopyButton text={s.text} />
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
