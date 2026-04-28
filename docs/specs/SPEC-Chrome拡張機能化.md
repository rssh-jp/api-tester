# SPEC-Chrome拡張機能化: Chrome Extension (Manifest V3) 対応

> **ステータス**: 草稿  
> **作成日**: 2026-04-28  
> **最終更新**: 2026-04-28

---

## 1. 背景・目的

- **背景**: 現在の api-tester は Next.js (App Router) で実装されており、ローカル開発サーバーまたは Vercel 等へのデプロイが必要。ブラウザを開いて URL を入力するという手間があるため、開発中に素早く API テストツールを起動できない。
- **目的**: Chrome 拡張機能（Manifest V3）として配布することで、新規タブを開くだけで即座に api-tester が起動できるようにする。また、拡張機能の `host_permissions` を利用することで CORS プロキシが不要になり、静的ファイルのみで完結する配布形式が実現できる。
- **スコープ（含むもの）**:
  - Chrome 拡張機能 Manifest V3 対応（新規タブページとして表示）
  - `npm run build:extension` コマンドによる拡張機能用ビルド
  - ビルド成果物を `extension/` ディレクトリに出力
  - `host_permissions: ["<all_urls>"]` による CORS 回避（プロキシ不要）
  - 既存の IndexedDB / localStorage ストレージをそのまま流用
  - 既存の Next.js 開発環境（`npm run dev`）との共存
- **スコープ（含まないもの）**:
  - Firefox / Edge 等の他ブラウザ拡張機能への対応
  - Chrome Web Store への公開・審査対応
  - 拡張機能独自の `chrome.storage` API への移行
  - バックグラウンドサービスワーカーを用いた機能（通知・同期等）
  - 拡張機能のポップアップ形式（アイコンクリックで小窓表示）

---

## 2. ユーザーストーリー

| # | ストーリー |
|---|-----------|
| US-1 | 開発者として、Chrome の新規タブを開くと api-tester がフルスクリーンで表示されるので、URL を入力することなく即座に API テストを開始できる |
| US-2 | 開発者として、拡張機能からそのまま外部 API へリクエストを送信できるので、別途プロキシサーバーを起動する必要がない |
| US-3 | 開発者として、拡張機能と通常の Next.js 開発環境（`npm run dev`）の両方を使い分けられるので、開発・デバッグと実運用の両方に対応できる |
| US-4 | 開発者として、`npm run build:extension` を 1 コマンド実行するだけで拡張機能パッケージが生成されるので、ビルド手順を覚える必要がない |

---

## 3. 機能要件

### 3.1 必須要件（Must Have）

- [ ] `extension/manifest.json` を追加し、Manifest V3 形式で記述すること
- [ ] 新規タブ（`chrome_url_overrides.newtab`）として `index.html` を指定すること
- [ ] `host_permissions: ["<all_urls>"]` を設定し、任意のオリジンへの直接 fetch を許可すること
- [ ] `npm run build:extension` コマンドを `package.json` に追加すること
- [ ] ビルドコマンドは `NEXT_PUBLIC_STATIC_EXPORT=true` で Next.js 静的エクスポートを実行し、出力を `extension/` へ配置すること（`manifest.json` を含む）
- [ ] 拡張機能ビルド時は `sendRequest.ts` の直接 fetch モード（`NEXT_PUBLIC_STATIC_EXPORT=true`）が使用されること（プロキシ API は使用しない）
- [ ] `npm run dev` / `npm run build` / `npm start` の既存コマンドが引き続き動作すること
- [ ] IndexedDB (`api-tester-db`) および localStorage が拡張機能ページでも正常に動作すること

### 3.2 推奨要件（Should Have）

- [ ] `extension/` ディレクトリを `.gitignore` に追加し、ビルド成果物をリポジトリに含めないこと
- [ ] `manifest.json` のソースファイルを `extension-src/manifest.json` として管理し、ビルド時にコピーすること
- [ ] ビルドスクリプト（`scripts/build-extension.sh` 等）に各ステップのログ出力を含め、失敗時に即座に停止すること（`set -e`）
- [ ] `README.md` に拡張機能のビルド・インストール手順を追記すること

### 3.3 将来対応（Nice to Have）

- [ ] `web_accessible_resources` を活用したサイドパネル表示モード（`chrome.sidePanel`）
- [ ] Firefox `browser_specific_settings` による Firefox 拡張機能（MV3）サポート
- [ ] GitHub Actions による自動ビルドと `.zip` 成果物のアップロード

---

## 4. 非機能要件

- **パフォーマンス**: 新規タブを開いてから UI がインタラクティブになるまで 2 秒以内（コールドスタート）
- **セキュリティ**:
  - `manifest.json` の `content_security_policy.extension_pages` は `"script-src 'self'; object-src 'self'"` とし、`unsafe-eval` や `unsafe-inline` は使用しないこと
  - `host_permissions` は `"<all_urls>"` のみとし、`tabs` / `history` 等のセンシティブなパーミッションは要求しないこと
  - 拡張機能ページ上でユーザーが入力した認証情報（Authorization ヘッダー等）は IndexedDB のみに保存し、外部サーバーへ送信しないこと
- **アクセシビリティ**: 既存の Web UI と同等のキーボード操作・スクリーンリーダー対応を維持すること
- **ブラウザ対応**: Chrome 最新版（Manifest V3 対応: Chrome 88+）

---

## 5. UI/UX 設計

### 5.1 表示形式

新規タブを開いたとき、既存の api-tester UI がフルスクリーンで表示される。レイアウト・デザイン変更は一切行わない。

```
┌─────────────────────────────────────────────────────────────┐
│ (新規タブ)  api-tester                                       │
├──────────┬──────────────────────────────────────────────────┤
│          │  GET  https://api.example.com/...       [Send]   │
│ Sidebar  ├──────────────────────────────────────────────────┤
│          │  Headers │ Params │ Body                         │
│          ├──────────────────────────────────────────────────┤
│          │  Response                                        │
└──────────┴──────────────────────────────────────────────────┘
```

### 5.2 ユーザー操作フロー — 拡張機能インストール

```
1. ユーザーが npm run build:extension を実行する
2. extension/ ディレクトリにビルド成果物と manifest.json が生成される
3. Chrome で chrome://extensions を開き、「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」から extension/ を選択する
5. 以降、新規タブを開くと api-tester が表示される
```

### 5.3 エラーハンドリング

| エラー条件 | 表示 / 対処 |
|-----------|------------|
| CSP 違反（インラインスクリプト等） | Chrome 拡張機能エラーコンソールに表示。ビルドを修正して再ロードする |
| `host_permissions` 不足による fetch 失敗 | 既存の `sendRequest.ts` のエラーハンドリングで ResponsePanel にエラー表示 |
| `extension/` が存在しない状態でのビルドスクリプト実行 | スクリプトがディレクトリを自動作成（`mkdir -p extension`） |

---

## 6. API 設計

### 6.1 内部 API ルート

拡張機能ビルドでは Next.js の静的エクスポート（`output: 'export'`）を使用するため、`app/api/proxy/route.ts` はビルド成果物に含まれない。リクエスト送信は `sendRequest.ts` の直接 fetch モードを使用する。

`next.config.ts` の既存ロジックにより、`NEXT_PUBLIC_STATIC_EXPORT=true` のとき `output: 'export'` が自動で有効になる（変更不要）。

---

## 7. ファイル・ディレクトリ構成の変更

### 7.1 新規追加ファイル

```
extension-src/
  manifest.json           # Manifest V3 ソース（ビルド時に extension/ へコピー）
scripts/
  build-extension.sh      # 拡張機能ビルドスクリプト
extension/                # ビルド成果物（.gitignore 対象）
  manifest.json
  index.html
  _next/
    static/
      ...
```

### 7.2 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `package.json` | `"build:extension"` スクリプトを追加 |
| `.gitignore` | `extension/` を追加 |
| `README.md` | 拡張機能ビルド・インストール手順を追記 |

### 7.3 変更不要なファイル

`src/` 配下の全ファイル（`next.config.ts` の静的エクスポート対応は既に実装済みのため変更不要）。

---

## 8. データモデル変更

### 8.1 IndexedDB / localStorage

変更なし。Chrome 拡張機能ページ（`chrome-extension://<id>/index.html`）は独立したオリジンとして扱われるため、通常の Web ページとは IndexedDB / localStorage の名前空間が分離される。  
**既存の Next.js デプロイ版との間でデータは共有されない**（別オリジン）。

### 8.2 manifest.json スキーマ

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
  },
  "icons": {
    "16":  "icons/icon16.png",
    "48":  "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

> **注意**: アイコン画像（`icons/`）は `extension-src/icons/` に配置し、ビルド時に `extension/icons/` へコピーする。アイコン未作成の場合は `icons` フィールドを省略して可。

### 8.3 ビルドスクリプト（scripts/build-extension.sh）

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

### 8.4 package.json スクリプト追加

```json
"build:extension": "bash scripts/build-extension.sh"
```

---

## 9. 技術的注意点・既知の制約

### 9.1 Content Security Policy と Next.js 静的エクスポート

Manifest V3 の CSP（`script-src 'self'`）は `unsafe-eval` および `unsafe-inline` を禁止する。Next.js の静的エクスポートが生成する `index.html` にインラインスクリプトが含まれる場合、拡張機能として動作しない。

- **確認方法**: ビルド後の `extension/index.html` にインライン `<script>` タグが含まれていないか確認する
- **対処法**: Next.js 13+ の静的エクスポートではインラインスクリプトは原則生成されない。問題が生じた場合は `next.config.ts` で `inlineScripts: false` 等の設定を検討する

### 9.2 オリジン分離によるデータ独立性

前述の通り、拡張機能版と Vercel/ローカル版では IndexedDB のオリジンが異なるため、データが分離される。データを移行したい場合は SPEC-設定エクスポートインポート で定義されたエクスポート/インポート機能を使用する。

### 9.3 `chrome_url_overrides.newtab` の制約

- 1 つの拡張機能しか新規タブページを上書きできない。複数の拡張機能が競合する場合、最後にインストールしたものが優先される
- ユーザーが Chrome の設定から新規タブページを変更すると本拡張機能の設定が上書きされる場合がある

### 9.4 静的エクスポートと `trailingSlash`

`next.config.ts` で `trailingSlash: true` が設定されており、`out/index.html` が正しく生成される。`chrome-extension://<id>/index.html` として直接アクセスされるため問題なし。

---

## 10. 受け入れ条件

以下をすべて満たすことでリリース可能とする。

- [ ] AC-1: `npm run build:extension` が成功し、`extension/` ディレクトリに `index.html`・`manifest.json`・`_next/` が存在すること
- [ ] AC-2: Chrome の `chrome://extensions` で「デベロッパーモード」を有効にして `extension/` を読み込んだとき、エラーが表示されないこと
- [ ] AC-3: Chrome で新規タブを開くと api-tester の UI がフルスクリーンで表示されること
- [ ] AC-4: 拡張機能上から外部 API（例: `https://httpbin.org/get`）へ GET リクエストを送信し、200 レスポンスと Body が正しく表示されること（CORS エラーが発生しないこと）
- [ ] AC-5: カテゴリー作成・リクエスト保存・履歴確認の基本操作がすべて動作すること
- [ ] AC-6: 拡張機能ページをリロードした後もカテゴリーと保存済みリクエストが IndexedDB から正しく復元されること
- [ ] AC-7: `npm run dev` が引き続き正常に起動し、既存機能が壊れていないこと（リグレッションなし）
- [ ] AC-8: `npm run build` （通常ビルド）が成功すること
- [ ] AC-9: Chrome の拡張機能エラーコンソールに CSP 違反エラーが出ていないこと

---

## 11. 対象外（スコープ外）

- Firefox / Edge / Safari 拡張機能対応
- Chrome Web Store への公開（ストアポリシー審査・プライバシーポリシー等）
- `chrome.storage.sync` / `chrome.storage.local` を用いたデータの同期
- バックグラウンドサービスワーカーによる定期実行・プッシュ通知
- ポップアップ形式（ツールバーアイコンクリックで小窓表示）
- 拡張機能のオートアップデート仕組み

---

## 12. 備考・制約

- **依存する他機能**: SPEC-設定エクスポートインポート（拡張機能版と Web 版間のデータ移行に利用可）
- **既存機能への影響**: `src/` 配下のコードは変更しないため、既存機能への影響はない
- **参考資料**:
  - [Chrome Extensions – Manifest V3 Overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
  - [chrome_url_overrides – Chrome Developers](https://developer.chrome.com/docs/extensions/reference/manifest/chrome-url-overrides)
  - [Next.js Static Exports](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
