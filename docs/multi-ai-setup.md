# Claude Code に ChatGPT / Gemini / Claude を統合する

Claude Code をハブにして、ChatGPT（Codex）と Gemini を呼び分けられるようにする手順です。
「gemini で最新ニュースを調べて、その結果を踏まえて gpt で提案書のたたき台を書いて」
のような指示が1つのセッションで完結します。

## 全体像

登録する MCP サーバは3つ。用途と認証方式が違います。

| サーバ | 中身 | 認証 | 向いている用途 |
| --- | --- | --- | --- |
| `gemini-cli` | Gemini CLI のラッパー | Google アカウント（無料枠可） | 調査・検索・ブレスト |
| `codex-cli` | Codex CLI 本体を MCP 化 | ChatGPT アカウント | 文章生成・コード相談 |
| `multi-llm` | 各社 API を直接叩く自作サーバ | **API キー** | 3モデルへの並列質問・比較 |

`gemini-cli` と `codex-cli` は各 CLI のログインを使うので **API 従量課金は発生しません**。
`multi-llm` だけは API キーが必要です（3モデルを並べて比較したいとき用。不要なら
`.mcp.json` から消して構いません）。

振り分けルールは `.claude/ai-routing.md` にあり、`CLAUDE.md` から読み込まれます。

---

## セットアップ

### 0. Node.js

[nodejs.org](https://nodejs.org/ja) から LTS 版を入れて確認します。

```bash
node -v
```

**Windows のみ**: PowerShell を管理者権限で開き、スクリプト実行を許可しておきます。

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 1. Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude
```

初回起動で Claude アカウントにログインします。

### 2. Gemini（`gemini-cli`）

Gemini の CLI は **Antigravity CLI（`agy`）に置き換わりました**。旧 `gemini-cli` は
2026-06-18 に Google AI Pro / Ultra アカウントへの提供を終了しており、
`gemini-mcp-tool` も既定のバックエンドが `agy` になっています。

**Windows（PowerShell）**

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

**macOS / Linux**

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

インストール先は `~/.local/bin`（Node.js 不要の単一バイナリ）。初回は次を実行すると
ブラウザが開き、Google アカウントでサインインできます（プレビュー期間中は無料アカウントで可）。

```bash
agy -p "say hi"
```

MCP 側（`gemini-mcp-tool`）は `.mcp.json` から `npx -y gemini-mcp-tool` で起動するため、
**個別のインストールは不要**です。

> **PATH に注意。** MCP サーバは Claude Code とは別プロセスで起動するため、シェルの PATH を
> 引き継がないことがあります。`Could not find the "agy" executable.` が出たら、
> `~/.local/bin` を PATH に追加するか、環境変数 `AGY_CLI_PATH` に `agy` の絶対パスを設定してください。

> **旧 Gemini CLI を使いたい場合**は `GEMINI_MCP_BACKEND=gemini` を設定すると
> `gemini` コマンドを使い続けられますが、有料 API キーか Enterprise / Standard ライセンスが必要です。

> 参考にした記事では `gemini-mcp-tool-windows-fixed` という**有志のフォーク**が使われて
> いますが、ここでは本家の [`gemini-mcp-tool`](https://github.com/jamubc/gemini-mcp-tool)
> を指定しています。フォーク側は npm 上の repository URL が未設定（`your-username`）で
> 出所を追えないため、本家で問題が出た場合の代替として検討してください。

### 3. ChatGPT（`codex-cli`）

```bash
npm install -g @openai/codex
codex login
```

`codex login` でブラウザが開き、ChatGPT アカウントでログインします。

### 4. （任意）`multi-llm` を使う場合

3モデルへの並列質問を使うときだけ必要です。リポジトリ直下の `.env.local` にキーを置きます
（`.gitignore` 済み）。

```dotenv
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
```

詳細は [`tools/multi-llm-mcp/README.md`](../tools/multi-llm-mcp/README.md)。

### 5. 接続確認

このリポジトリで `claude` を起動すると、`.mcp.json` のサーバが検出され承認を求められます。

```
/mcp
```

`gemini-cli` / `codex-cli` / `multi-llm` が `connected` になっていれば完了です。

---

## このリポジトリ以外でも使いたい場合

`.mcp.json` はプロジェクトスコープなので、このリポジトリを開いたときだけ有効です。
どのディレクトリでも使いたい場合は、ユーザースコープで登録してください。

```bash
claude mcp add gemini-cli --scope user -- npx -y gemini-mcp-tool
claude mcp add codex-cli  --scope user -- codex mcp-server -c sandbox_mode=read-only
claude mcp list
```

振り分けルールも同様に、`.claude/ai-routing.md` の内容を
`~/.claude/CLAUDE.md`（Windows は `C:\Users\<ユーザー名>\.claude\CLAUDE.md`）へ
コピーすると全プロジェクトで効きます。

---

## 使い方

```
geminiで今日のAI関連ニュースをまとめて
gptで業績フィードバックの文章を3パターン作って
geminiで競合の動向を調べて、その結果を踏まえてgptで戦略提案書の書き出しを作って
```

```
/ask3 Next.js の Server Actions でファイルアップロードを扱う定石は？
```

`/ask3` は3モデルに同じ質問を投げ、一致点・相違点・結論の形にまとめます。

---

## うまく動かないとき

| 症状 | 原因と対処 |
| --- | --- |
| `Could not find the "agy" executable.` | Antigravity CLI が未インストールか PATH 外。上記「2. Gemini」を参照し、`AGY_CLI_PATH` を設定する |
| Codex 側が `401 Unauthorized` | `codex login` が済んでいない。ログインし直す |
| `multi-llm` が全部「未設定です」 | `.env.local` に API キーが無い。3モデル並列比較を使わないなら `.mcp.json` から `multi-llm` を消してよい |
| `/mcp` にサーバが出てこない | リポジトリ直下で `claude` を起動しているか確認。別の場所から使うなら「このリポジトリ以外でも使いたい場合」を参照 |

## 注意点

### Codex はサンドボックス `read-only` で起動している

`.mcp.json` では `-c sandbox_mode=read-only` を付けています。Codex は単なる
チャットモデルではなく**ファイルを読み書きできるエージェント**なので、既定では
Claude Code の与り知らないところでリポジトリを書き換えられます。相談相手として
使う前提で読み取り専用にしてあります。

Codex にも編集させたい場合は `.mcp.json` の該当行を
`workspace-write` に変えてください（`danger-full-access` は非推奨）。

### `codex mcp-server` は非推奨

起動時に `codex mcp-server is deprecated and will be removed in a future release.`
という警告が出ます（Codex CLI 0.153.4 で確認）。動作はしますが、現時点で
代替となる MCP サーバ用サブコマンドは提供されていません（`codex mcp` は
Codex 側が外部 MCP を使うための**クライアント**機能、`codex app-server` は
MCP とは別プロトコルの実験的機能）。削除された場合は
`codex-as-mcp` などのサードパーティラッパーへの移行が必要になります。

### 各モデルはリポジトリを見ていない

`ask-gemini` も `codex` も、Claude Code の会話履歴やこのリポジトリの中身を
自動では受け取りません。コードについて聞くときは該当箇所をプロンプトに含めてください。
`.claude/ai-routing.md` にもその原則を書いてあります。

### 料金

- `gemini-cli` / `codex-cli` … 各サービスのアカウント（無料枠を含む）の範囲。API 課金なし。
- `multi-llm` … API キー従量課金。使った分だけ各社に請求されます。
