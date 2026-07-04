This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

LINE メッセージの起草・添削に加えて、**予定の前後の場所から移動時間を計算し
Google カレンダーに登録する**機能を備えています。

- **手動**: 「🗓️ 予定」タブでその日の行程を入力すると、区間ごとの移動時間ブロックの
  「Google カレンダーに追加」リンクを生成します（設定不要）。
- **自動連携**: Google と OAuth 連携すると、予定を登録・変更したときに
  前後の予定の場所から移動時間ブロックを自動でカレンダーへ挿入します（下記セットアップが必要）。

## 自動連携のセットアップ

自動連携は Google OAuth と、Google からの Push 通知 / cron を受ける公開 URL が必要です。

### 1. Google Cloud 側

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成し、
   **Google Calendar API** を有効化する。
2. **OAuth 同意画面**を設定し、スコープ `.../auth/calendar.events` を追加。
3. **OAuth クライアント ID（ウェブアプリケーション）**を作成し、
   承認済みリダイレクト URI に `https://<あなたのドメイン>/api/auth/google/callback` を登録。
4. （任意）より正確な移動時間のため **Distance Matrix API** を有効化して API キーを発行。

### 2. 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | ✅ | OAuth クライアント ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | OAuth クライアントシークレット |
| `APP_BASE_URL` | ✅ | デプロイ先の公開 URL（例 `https://your-app.vercel.app`）。リダイレクト / Webhook のベース |
| `ANTHROPIC_API_KEY` | ✅ | 文章生成・移動時間の AI 概算に使用 |
| `GOOGLE_MAPS_API_KEY` | 任意 | 設定すると Distance Matrix API で正確に算出（未設定なら AI 概算） |
| `GOOGLE_CALENDAR_ID` | 任意 | 対象カレンダー（既定 `primary`） |
| `TRAVEL_MODE` | 任意 | `train`(既定) / `car` / `walk` / `bike` |
| `SYNC_DAYS_AHEAD` | 任意 | 何日先まで同期するか（既定 `7`） |
| `CRON_SECRET` | 任意 | 設定すると `/api/calendar/sync`・`/api/calendar/watch` を `Authorization: Bearer` で保護 |
| `WEBHOOK_TOKEN` | 任意 | Push 通知の検証トークン |
| `TOKEN_STORE_PATH` | 任意 | KV 未接続時のローカル保存先（既定 `.data/google-tokens.json`） |

### 3. トークンの保存先（重要）

Vercel などのサーバーレス環境ではファイルシステムが永続化されないため、OAuth トークンは
**Vercel KV（または互換の Upstash Redis）に保存する**実装になっています
（`app/lib/tokenStore.ts`）。Vercel の「Storage」タブから KV データベースを作成しプロジェクトに
接続すると、`KV_REST_API_URL` / `KV_REST_API_TOKEN` が自動で環境変数に追加され、自動的にそちらが
使われます。KV 未接続の場合はローカルファイルにフォールバックします（ローカル開発用。本番では
永続化されないため非推奨）。

### 4. 定期実行（cron）

- `GET /api/calendar/watch` … Push 通知チャンネルの貼り直し（最長 7 日で失効するため 1 日 1 回程度）。
- `GET /api/calendar/sync` … Webhook の取りこぼしに備えた保険の同期（数時間おき）。

Vercel の場合は `vercel.json` の `crons` で上記エンドポイントを叩き、`CRON_SECRET` を付与してください。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
