// OAuth トークンと Push 通知チャンネル情報の保存を抽象化する。
// Vercel KV（環境変数 KV_REST_API_URL / KV_REST_API_TOKEN）が設定されていればそちらを使う。
// 未設定（ローカル開発など）の場合はファイルシステムにフォールバックする。
// サーバーレス環境（Vercel等）ではファイルシステムは永続化されないため、
// 本番では必ず KV を接続すること。

import { promises as fs } from "node:fs";
import path from "node:path";
import { kv } from "@vercel/kv";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface WatchChannel {
  channelId: string;
  resourceId: string;
  expiration: number; // epoch ms
}

export interface StoreShape {
  tokens?: StoredTokens;
  watch?: WatchChannel;
  syncToken?: string; // 増分同期用（任意）
}

export interface TokenStore {
  read(): Promise<StoreShape>;
  write(data: StoreShape): Promise<void>;
  clear(): Promise<void>;
}

const KV_KEY = "line-app:google-calendar-store";

class KvTokenStore implements TokenStore {
  async read(): Promise<StoreShape> {
    const data = await kv.get<StoreShape>(KV_KEY);
    return data ?? {};
  }

  async write(data: StoreShape): Promise<void> {
    await kv.set(KV_KEY, data);
  }

  async clear(): Promise<void> {
    await kv.del(KV_KEY);
  }
}

class FileTokenStore implements TokenStore {
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  async read(): Promise<StoreShape> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return JSON.parse(raw) as StoreShape;
    } catch {
      return {};
    }
  }

  async write(data: StoreShape): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.file);
    } catch {
      // 既に無ければ何もしない
    }
  }
}

function hasKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

let instance: TokenStore | null = null;

export function getTokenStore(): TokenStore {
  if (!instance) {
    if (hasKv()) {
      instance = new KvTokenStore();
    } else {
      const file =
        process.env.TOKEN_STORE_PATH ??
        path.join(process.cwd(), ".data", "google-tokens.json");
      instance = new FileTokenStore(file);
    }
  }
  return instance;
}
