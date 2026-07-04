// OAuth トークンと Push 通知チャンネル情報の保存を抽象化する。
// 既定はファイルシステム実装（自己ホスト / node サーバー向け）。
// 本番のサーバーレス環境では、この TokenStore を KV / DB 実装に差し替えること。

import { promises as fs } from "node:fs";
import path from "node:path";

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

let instance: TokenStore | null = null;

export function getTokenStore(): TokenStore {
  if (!instance) {
    const file =
      process.env.TOKEN_STORE_PATH ??
      path.join(process.cwd(), ".data", "google-tokens.json");
    instance = new FileTokenStore(file);
  }
  return instance;
}
