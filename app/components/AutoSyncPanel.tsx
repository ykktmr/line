"use client";

import { useEffect, useState } from "react";

interface Status {
  connected: boolean;
  configured: boolean;
}

// OAuth リダイレクト後の ?gc= から初期メッセージを導出（レンダー中に一度だけ）
function initialMessage(): string | null {
  if (typeof window === "undefined") return null;
  const gc = new URLSearchParams(window.location.search).get("gc");
  const map: Record<string, string> = {
    connected: "Googleカレンダーと連携しました ✓",
    denied: "連携がキャンセルされました",
    invalid: "連携に失敗しました（再試行してください）",
    error: "連携中にエラーが発生しました",
  };
  return gc ? map[gc] ?? null : null;
}

export function AutoSyncPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = () =>
    fetch("/api/calendar/status")
      .then((res) => res.json())
      .then((data: Status) => setStatus(data))
      .catch(() => setStatus({ connected: false, configured: false }));

  useEffect(() => {
    loadStatus();
    // 表示済みの ?gc= はURLから消しておく
    if (new URLSearchParams(window.location.search).has("gc")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "同期に失敗しました");
      } else {
        setMessage(
          `同期完了：移動 ${data.created} 件追加 / ${data.updated} 件更新 / ${data.deleted} 件削除`
        );
      }
    } catch {
      setMessage("通信エラーが発生しました");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch("/api/auth/google/disconnect", { method: "POST" });
    setMessage("連携を解除しました");
    loadStatus();
  };

  if (!status) return null;

  return (
    <div className="mb-5 rounded-2xl border border-gray-200 p-4 bg-gray-50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">⚡</span>
        <p className="text-sm font-semibold text-gray-700">
          Googleカレンダー自動連携
        </p>
        {status.connected && (
          <span className="ml-auto text-xs font-semibold text-green-600">
            連携済み ✓
          </span>
        )}
      </div>

      {!status.configured ? (
        <p className="text-xs text-gray-500 leading-relaxed">
          この機能を使うにはサーバー側の設定（Google OAuth
          認証情報とデプロイURL）が必要です。README
          の「自動連携のセットアップ」を参照してください。
        </p>
      ) : status.connected ? (
        <>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            予定を登録・変更すると、前後の場所から移動時間を自動でカレンダーに挿入します。
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex-1 py-2 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-50"
              style={{ backgroundColor: "#4285F4" }}
            >
              {syncing ? "同期中..." : "今すぐ同期"}
            </button>
            <button
              onClick={handleDisconnect}
              className="py-2 px-3 rounded-xl text-sm font-medium border border-gray-300 text-gray-600 transition-all"
            >
              連携解除
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            連携すると、予定の登録・変更時に前後の場所から移動時間を自動でカレンダーへ追加します。
          </p>
          <a
            href="/api/auth/google"
            className="block w-full py-2.5 rounded-xl text-white text-sm font-bold text-center transition-all"
            style={{ backgroundColor: "#4285F4" }}
          >
            Googleカレンダーと連携する
          </a>
        </>
      )}

      {message && (
        <p className="mt-3 text-xs text-gray-600 bg-white rounded-lg px-3 py-2 border border-gray-100">
          {message}
        </p>
      )}
    </div>
  );
}
