"use client";

import { useState } from "react";
import { DraftForm } from "./components/DraftForm";
import { ReviewForm } from "./components/ReviewForm";

type Mode = "draft" | "review";

export default function Home() {
  const [mode, setMode] = useState<Mode>("draft");

  return (
    <main className="min-h-screen py-6 px-4" style={{ backgroundColor: "#f0f0f0" }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
            style={{ backgroundColor: "#06C755" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.48 2 2 6.03 2 11c0 3.18 1.73 5.99 4.35 7.71-.16.53-.64 1.94-1.35 3.29 0 0 3.03-1.03 5.07-2.05.62.1 1.27.15 1.93.15 5.52 0 10-4.03 10-9S17.52 2 12 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">LINE文章アシスタント</h1>
          <p className="text-xs text-gray-500 mt-1">AIがLINEメッセージの起草・添削をお手伝い</p>
        </div>

        <div className="flex bg-white rounded-2xl p-1 shadow-sm mb-5">
          {(["draft", "review"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                backgroundColor: mode === m ? "#06C755" : "transparent",
                color: mode === m ? "white" : "#888",
              }}
            >
              {m === "draft" ? "✍️ 起草" : "📝 添削"}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-5">
          {mode === "draft" ? (
            <>
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                送る相手・内容を入力して文章案を生成
              </h2>
              <DraftForm />
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                メッセージを貼り付けて改善案を取得
              </h2>
              <ReviewForm />
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Powered by Claude AI
        </p>
      </div>
    </main>
  );
}
