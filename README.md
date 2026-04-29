# api-tester

Talend API Tester ライクなブラウザ上で動く REST API テストツール。

## 機能

- HTTP リクエストの組み立て・送信・レスポンス確認（GET / POST / PUT / DELETE / PATCH / HEAD / OPTIONS）
- カテゴリーツリーによるリクエスト管理（ネスト・ドラッグドロップ移動対応）
- カテゴリー間のヘッダー / パラメータ / 変数の継承
- `${KEY}` プレースホルダーを使った変数展開（URL・ヘッダー・パラメータ・ボディ）
- リクエスト履歴の自動保存（最新 50 件）
- カテゴリー配下リクエストの一括実行（Batch Run）
- レスポンスの Content-Type 別表示（JSON / HTML / XML / 画像 / バイナリ）
- 設定のエクスポート / インポート（JSON ファイル）
- CORS 回避のためのサーバーサイドプロキシ（`/api/proxy`）
- 全データを **IndexedDB** に永続化（サーバー DB 不使用）
- Chrome 拡張機能としてインストール可能

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16.2.4（App Router） |
| UI | React 19 + TypeScript |
| スタイリング | Tailwind CSS v4 |
| テスト | Vitest + fake-indexeddb |
| ストレージ | IndexedDB + localStorage（展開状態のみ） |

## 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開く。

## ビルド

```bash
npm run build
```

## テスト

```bash
npm test
```

## Chrome 拡張機能としてインストール

### ビルド

```bash
npm run build:extension
```

### インストール

1. Chrome で `chrome://extensions` を開く
2. 「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」から `extension/` を選択
4. 新規タブを開くと api-tester が起動する

> **注意**: 拡張機能版のデータ（IndexedDB）は Web 版（`localhost:3000` 等）と独立したオリジンのため共有されません。データ移行が必要な場合は「設定エクスポート/インポート」機能を使用してください。
