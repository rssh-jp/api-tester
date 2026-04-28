# DESIGN-Chrome拡張機能化: Chrome Extension (Manifest V3) 対応

## 1. 概要

- **対応仕様書**: `docs/specs/SPEC-Chrome拡張機能化.md`
- **設計方針**:
  - `src/` 配下のソースコードは一切変更しない。`next.config.ts` の静的エクスポート対応（`NEXT_PUBLIC_STATIC_EXPORT=true` で `output: 'export'` が有効化）および `sendRequest.ts` の直接 fetch モードは既に実装済み。
  - 新規追加ファイル（`extension-src/manifest.json`、`scripts/build-extension.sh`）のみで完結させる。
  - 既存コマンド（`npm run dev` / `npm run build` / `npm start`）は変更しない。
  - `package.json` への `build:extension` スクリプト追加と `.gitignore` への `extension/` 追加のみ既存ファイルを変更する。

---

## 2. 変更ファイル一覧

| ファイル | 変更種別 | 変更内容 |
|---------|---------|---------|
| `package.json` | 変更 | `"build:extension"` スクリプトを追加 |
| `.gitignore` | 変更 | `extension/` を追加 |
| `README.md` | 変更 | 拡張機能ビルド・インストール手順を追記 |
| `extension-src/manifest.json` | 新規 | Manifest V3 ソースファイル |
| `scripts/build-extension.sh` | 新規 | 拡張機能ビルドスクリプト |

`src/` 配下・`next.config.ts` は変更しない。

---

## 3. 現状の確認と設計根拠

### 3.1 `next.config.ts`（変更不要）

```typescript
// 現状のまま。NEXT_PUBLIC_STATIC_EXPORT=true で output: 'export' + trailingSlash: true が有効になる
const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';
const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: 'export', trailingSlash: true } : {}),
  images: { unoptimized: true }, // 既に設定済み
};
```

- `output: 'export'` により `out/` ディレクトリへ静的ファイルが出力される
- `trailingSlash: true` により `app/page.tsx`（ルート `/`）が `out/index.html` として出力される
- `images: { unoptimized: true }` により Next.js Image Optimization が無効化済み

### 3.2 `src/lib/sendRequest.ts`（変更不要）

```typescript
// 既存の判定ロジック
const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';
```

- `NEXT_PUBLIC_STATIC_EXPORT=true` でビルドすると `STATIC = true` がバンドルされ、プロキシ API を経由せずブラウザから直接 `fetch()` する
- 拡張機能の `host_permissions: ["<all_urls>"]` により CORS 制約なしで外部 API へアクセス可能

### 3.3 `src/app/layout.tsx`（変更不要）

```typescript
// next/font/google の Inter は静的エクスポート時にフォントファイルを _next/static/media/ に
// バンドルするため、外部オリジンへのアクセスは発生しない。CSP との互換性問題なし。
import { Inter } from 'next/font/google';
```

### 3.4 アセットパスの解決（Chrome 拡張機能での動作）

Next.js 静的エクスポートが生成する `index.html` 内のアセット参照は `/_next/static/...` 形式（ルート相対パス）となる。Chrome 拡張機能では：

```
chrome-extension://<id>/index.html   → extension/index.html
chrome-extension://<id>/_next/...    → extension/_next/...
```

拡張機能のオリジンルートが `extension/` ディレクトリに対応するため、`/_next/...` パスは正しく解決される。`assetPrefix` の設定は不要。

---

## 4. 新規追加ファイル

### 4.1 `extension-src/manifest.json`

Manifest V3 の設定ファイル。ビルド時に `extension/manifest.json` へコピーされる。

```json
{
  "manifest_version": 3,
  "name": "api-tester",
  "version": "0.1.0",
  "description": "REST API テストツール（Talend API Tester ライク）",
  "chrome_url_overrides": {
    "newtab": "index.html"
  },
  "permissions": [],
  "host_permissions": ["<all_urls>"],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

**設計上の判断**:

| フィールド | 値 | 理由 |
|-----------|-----|------|
| `manifest_version` | `3` | Chrome 88+ 対応の現行バージョン |
| `chrome_url_overrides.newtab` | `"index.html"` | 新規タブを api-tester で上書き |
| `permissions` | `[]` | tabs / history 等のセンシティブな権限は不要 |
| `host_permissions` | `["<all_urls>"]` | 任意の外部 API への直接 fetch を許可（CORS 回避） |
| `content_security_policy.extension_pages` | `"script-src 'self'; object-src 'self'"` | `unsafe-eval` / `unsafe-inline` を禁止。Next.js App Router の静的エクスポートはインラインスクリプトを生成しないため互換性あり |
| `icons` | 省略 | 初期版はアイコンなし。追加する場合は `extension-src/icons/` に配置しフィールドを追記する |

**CSP 互換性の検証ポイント**:
- Next.js 13+ App Router の静的エクスポートは Pages Router と異なり `__NEXT_DATA__` インラインスクリプトを生成しない
- `@import "tailwindcss"` はビルド時に CSS ファイルへ変換されるためインラインスタイル問題なし
- `next/font/google` は `_next/static/media/` にフォントファイルをバンドルし CSS ファイルで参照するためインラインスタイル問題なし
- **ビルド後に `extension/index.html` を目視確認し、インライン `<script>` タグがないことを必ず検証すること**（AC-9 対応）

### 4.2 `scripts/build-extension.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "[1/4] Cleaning extension/ ..."
rm -rf extension
mkdir -p extension

echo "[2/4] Building Next.js static export ..."
NEXT_PUBLIC_STATIC_EXPORT=true npx next build

echo "[3/4] Copying build output to extension/ ..."
cp -r out/. extension/

echo "[4/4] Copying manifest.json ..."
cp extension-src/manifest.json extension/manifest.json

# アイコンが存在する場合のみコピー
if [ -d extension-src/icons ]; then
  cp -r extension-src/icons extension/icons
fi

echo "Done. Load 'extension/' in chrome://extensions (Developer mode)."
```

**設計上の判断**:

- `set -euo pipefail`: いずれかのコマンドが失敗した時点で即座に停止（ビルド失敗を無視しない）
- `rm -rf extension` → `mkdir -p extension`: クリーンビルドを保証
- `cp -r out/. extension/`: `out/` の中身（`index.html`、`_next/` 等）を `extension/` 直下へコピー
- `cp extension-src/manifest.json extension/manifest.json`: `out/` に含まれない `manifest.json` を追加
- アイコンディレクトリは任意（`if [ -d ... ]` で存在チェック）
- `NEXT_PUBLIC_NEXT_PUBLIC_STATIC_EXPORT=true npx next build`: `next build` は `node_modules/.bin/next` を直接呼ぶより `npx next` が確実

---

## 5. 既存ファイルの変更内容

### 5.1 `package.json`

`"scripts"` セクションに `"build:extension"` を追加する。

```json
// 変更前
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "migrate": "bash run_build.sh"
},

// 変更後
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "migrate": "bash run_build.sh",
  "build:extension": "bash scripts/build-extension.sh"
},
```

### 5.2 `.gitignore`

`extension/` をビルド成果物として追加する。次の `# production` セクションに追記する。

```
# 変更前
# production
/build

# 変更後
# production
/build
/extension
```

### 5.3 `README.md`

既存コンテンツ末尾に以下のセクションを追記する。

```markdown
## Chrome 拡張機能としてのビルドと使用

### 拡張機能のビルド

```bash
npm run build:extension
```

`extension/` ディレクトリにビルド成果物（`index.html`、`manifest.json`、`_next/` 等）が生成される。

### Chrome へのインストール

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `extension/` ディレクトリを選択する

インストール後、新規タブを開くと api-tester がフルスクリーンで表示される。

### データの独立性

拡張機能版は `chrome-extension://<id>` オリジンで動作するため、Web デプロイ版とは IndexedDB / localStorage のデータが分離される。データを移行する場合は「設定エクスポート/インポート」機能を使用すること。
```

---

## 6. ビルドフロー

```
npm run build:extension
        │
        ▼
scripts/build-extension.sh
        │
        ├── [1/4] rm -rf extension; mkdir -p extension
        │
        ├── [2/4] NEXT_PUBLIC_STATIC_EXPORT=true npx next build
        │           │
        │           │  next.config.ts が検知:
        │           │    output: 'export'  → out/ へ静的ファイル出力
        │           │    trailingSlash: true → out/index.html 生成
        │           │    images.unoptimized: true → 画像最適化スキップ
        │           │
        │           │  sendRequest.ts がバンドル時に確定:
        │           │    STATIC = true → 直接 fetch モード固定
        │           └──
        │
        ├── [3/4] cp -r out/. extension/
        │           out/index.html      → extension/index.html
        │           out/_next/          → extension/_next/
        │
        └── [4/4] cp extension-src/manifest.json extension/manifest.json
                    （extension-src/icons/ が存在すれば extension/icons/ もコピー）

最終的な extension/ の構成:
  extension/
    manifest.json        ← extension-src/manifest.json のコピー
    index.html           ← Next.js 静的エクスポートの出力
    _next/
      static/
        chunks/          ← JS バンドル
        css/             ← Tailwind CSS
        media/           ← next/font フォントファイル
```

---

## 7. 実装手順

依存関係を考慮した実装順序：

1. **`extension-src/manifest.json` を作成**
   - セクション 4.1 の内容で新規作成

2. **`scripts/build-extension.sh` を作成**
   - セクション 4.2 の内容で新規作成
   - 実行権限を付与: `chmod +x scripts/build-extension.sh`

3. **`package.json` を変更**
   - `"build:extension": "bash scripts/build-extension.sh"` を追加

4. **`.gitignore` を変更**
   - `/extension` を追加

5. **動作確認**（セクション 8 参照）

6. **`README.md` を更新**
   - 拡張機能ビルド・インストール手順を追記

---

## 8. テスト・検証方法

### 8.1 ビルド確認（AC-1）

```bash
npm run build:extension
```

成功時、以下が存在することを確認：

```bash
ls extension/
# → index.html  manifest.json  _next/
```

### 8.2 既存コマンドの動作確認（AC-7, AC-8）

```bash
npm run dev    # 正常起動すること
npm run build  # ビルドエラーがないこと
npm test       # 既存テストがすべてパスすること
```

### 8.3 拡張機能のロード確認（AC-2）

1. `chrome://extensions` を開き「デベロッパーモード」をオン
2. 「パッケージ化されていない拡張機能を読み込む」→ `extension/` を選択
3. 拡張機能カードにエラーバッジが表示されないことを確認

### 8.4 新規タブ表示確認（AC-3）

新規タブを開き、api-tester の UI がフルスクリーンで表示されることを確認

### 8.5 API リクエスト送信確認（AC-4）

`https://httpbin.org/get` に GET リクエストを送信し、200 レスポンスと JSON ボディが表示されること（CORS エラーなし）

### 8.6 データ永続化確認（AC-5, AC-6）

1. カテゴリー作成・リクエスト保存・送信・履歴確認の基本操作が動作すること
2. 拡張機能ページをリロード（F5）後、カテゴリーと保存済みリクエストが IndexedDB から復元されること

### 8.7 CSP 違反確認（AC-9）

1. `extension/index.html` をテキストエディタで開き、インライン `<script>` タグ（`<script>...</script>` 形式で src 属性なし）がないことを確認
2. Chrome の「拡張機能エラー」コンソールに CSP 違反エラーが表示されないことを確認

---

## 9. 影響を受ける既存機能

| 機能名 | 影響内容 | 対応方針 |
|-------|---------|---------|
| `npm run dev` | 影響なし（`NEXT_PUBLIC_STATIC_EXPORT` 未設定のまま） | 変更不要 |
| `npm run build` | 影響なし（スクリプト追加のみ） | 変更不要 |
| CORS プロキシ (`/api/proxy`) | 拡張機能ビルドでは使用されない | 変更不要（Web 版では引き続き使用） |
| IndexedDB / localStorage | 拡張機能オリジンで独立して動作 | 変更不要 |

---

## 10. 懸念事項・リスク

### 10.1 CSP とインラインスクリプト

Next.js App Router 静的エクスポートではインラインスクリプトは原則生成されないが、Next.js のバージョンアップにより挙動が変わる可能性がある。ビルドごとに `extension/index.html` のインラインスクリプト有無を確認すること。問題が発生した場合は `next.config.ts` の `experimental` オプションで対処する。

### 10.2 `chrome_url_overrides.newtab` の競合

他の拡張機能（例: Momentum, Speed Dial）も新規タブページを上書きする場合、競合が発生する。最後にインストールした拡張機能が優先される。ユーザーへの周知が必要。

### 10.3 データ分離によるユーザー混乱

拡張機能版と Web デプロイ版は異なるオリジンのため IndexedDB データが共有されない。SPEC-設定エクスポートインポートのエクスポート/インポート機能でデータ移行可能であることを README に明記する。

### 10.4 `next/font/google` とネットワーク接続

`next/font/google` はビルド時に Google Fonts からフォントファイルをダウンロードする。オフライン環境でのビルドは失敗する。その場合は `src/app/layout.tsx` をローカルフォントに変更するか、フォントのダウンロードをスキップする環境変数（`NEXT_FONT_GOOGLE_OPTS_MOCK=1`）を検討すること（現行仕様のスコープ外）。
