"use client";

import { useState } from "react";
import { CopyButton } from "./CopyButton";

interface DraftResult {
  drafts: string[];
}

export function DraftForm() {
  const [recipient, setRecipient] = useState("friend");
  const [tone, setTone] = useState("casual");
  const [keywords, setKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, tone, keywords }),
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

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            送信相手
          </label>
          <select
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ focusRingColor: "#06C755" } as React.CSSProperties}
          >
            <option value="friend">友人・知人</option>
            <option value="boss">上司・先輩</option>
            <option value="client">取引先・お客様</option>
            <option value="family">家族</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            トーン
          </label>
          <div className="flex gap-2">
            {[
              { value: "casual", label: "カジュアル" },
              { value: "polite", label: "丁寧" },
              { value: "business", label: "ビジネス" },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                className="flex-1 py-2 rounded-xl text-sm font-medium border transition-all"
                style={{
                  backgroundColor: tone === t.value ? "#06C755" : "white",
                  color: tone === t.value ? "white" : "#555",
                  borderColor: tone === t.value ? "#06C755" : "#ddd",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            伝えたい内容・キーワード
          </label>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="例：明日の飲み会に参加できなくなった、謝りたい"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            rows={3}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !keywords.trim()}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
          style={{ backgroundColor: "#06C755" }}
        >
          {loading ? "生成中..." : "文章を生成する"}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-gray-600">文章案（3パターン）</p>
          {result.drafts.map((draft, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1">
                  <span
                    className="text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: "#06C755", color: "white" }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm text-gray-800 leading-relaxed flex-1">
                    {draft}
                  </p>
                </div>
                <CopyButton text={draft} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
