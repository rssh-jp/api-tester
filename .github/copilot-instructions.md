# Copilot Instructions — api-tester

## 1. プロジェクト概要・目的

Talend API Tester ライクな REST API テストツール。ブラウザ上で HTTP リクエストを組み立て・送信し、レスポンスを確認できる。カテゴリーツリーによるリクエスト管理、カテゴリー間のヘッダー/パラメータ継承、リクエスト履歴保存を提供する。サーバー DB は不使用で、全データを localStorage に永続化する。

---

## 2. 技術スタック詳細

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16.2.4（App Router、Turbopack） |
| UI | React + TypeScript |
| スタイリング | Tailwind CSS v4（`@import "tailwindcss"` 構文） |
| ダークテーマ | ディープスペースダーク：`#080c14` ベース、`#0d1117` サーフェス、インジゴ-500 アクセント |
| 状態管理 | React `useState` / `useEffect` のみ（Zustand 等のライブラリは不使用） |
| ストレージ | `localStorage` のみ（サーバー DB なし） |
| テスト | 未実装 |

---

## 3. ディレクトリ・ファイル構造

```
app/
  page.tsx              ルートページ（ApiTester をマウント、Server Component）
  layout.tsx            グローバルレイアウト（Server Component）
  globals.css           Tailwind + ダークテーマ CSS 変数定義
  api/
    proxy/
      route.ts          CORS 回避用プロキシ API Route

components/
  ApiTester.tsx         メイン状態コンテナ（左右ペイン分割）
  CategoryTree.tsx      左ペイン：ネストカテゴリーツリー
  CategoryEditor.tsx    右ペイン：カテゴリー編集（デフォルトヘッダー/パラメータ/継承プレビュー）
  UrlBar.tsx            URL 入力 + メソッド選択 + 送信ボタン
  RequestPanel.tsx      リクエスト編集パネル（タブ: Headers / Params / Body）
  ResponsePanel.tsx     レスポンス表示パネル（タブ: Body / Headers）
  KeyValueTable.tsx     キーバリューペア編集テーブル
  JsonViewer.tsx        JSON Pretty/Raw 表示

lib/
  types.ts              全共通型定義
  storage.ts            localStorage CRUD（カテゴリー、リクエスト、履歴）
  inheritance.ts        カテゴリー継承マージロジック
```

- `page.tsx` と `layout.tsx` のみ Server Component。それ以外の全コンポーネントは `'use client'` を先頭に宣言する。
- 新しいコンポーネントは `components/`、ユーティリティ・型は `lib/` に配置する。

---

## 4. 主要な型・インターフェース（lib/types.ts）

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

interface KeyValuePair {
  id: string
  key: string
  value: string
  enabled: boolean
}

interface RequestState {
  method: HttpMethod
  url: string
  params: KeyValuePair[]
  headers: KeyValuePair[]
  body: string
  contentType: string
}

interface ResponseState {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  responseTime: number
  size: number
  error?: string
}

interface HistoryItem {
  id: string
  request: RequestState
  response: ResponseState
  timestamp: number
}

interface Category {
  id: string
  name: string
  parentId: string | null   // null = ルートレベル
  defaultHeaders: KeyValuePair[]
  defaultParams: KeyValuePair[]
  description?: string
  createdAt: number
}

interface SavedRequest {
  id: string
  name: string
  categoryId: string | null  // null = カテゴリーなし
  request: RequestState
  createdAt: number
}

type Selection =
  | { type: 'request'; id: string }
  | { type: 'category'; id: string }
  | null
```

- ID 生成には必ず `genId()` を使用する（UUID）。

---

## 5. カテゴリー継承の仕組み（lib/inheritance.ts）

### 関数一覧

| 関数 | 説明 |
|------|------|
| `buildCategoryChain(categoryId, categories)` | 指定カテゴリーから祖先へのチェーンを返す `[immediate, parent, ..., root]` |
| `mergeKeyValues(requestValues, chain, field)` | チェーンとリクエスト値をマージして最終値を返す |
| `computeEffectiveValues(requestHeaders, requestParams, categoryId, categories)` | マージ済みヘッダー＋パラメータを返す |

### 優先度ルール

```
リクエスト固有値（最弱）→ 直近カテゴリー → 中間カテゴリー → ルートカテゴリー（最強）
```

- 同じキーが複数レベルで定義されている場合、**ルートカテゴリーの値が最優先**される。
- `enabled: false` のエントリはマージ結果から除外する。

---

## 6. ストレージ設計（lib/storage.ts）

### localStorage キー

| キー | 内容 |
|------|------|
| `api-tester-history` | `HistoryItem[]`（最新 50 件） |
| `api-tester-saved` | `SavedRequest[]` |
| `api-tester-categories` | `Category[]` |

### 重要な挙動

- 履歴は最新 50 件のみ保持し、古いものは自動削除する。
- `deleteCategory()` はサブカテゴリーとそれに属するリクエストを**カスケード削除**する。
- 旧フォーマットの `SavedRequest`（`categoryId` フィールドなし）は読み込み時に `categoryId: null` へ自動マイグレーションする。

---

## 7. CORS プロキシの仕組み（app/api/proxy/route.ts）

ブラウザの CORS 制約を回避するため、全ての外部 API リクエストを Next.js API Route 経由で転送する。

### リクエスト（POST）

```json
{
  "method": "GET",
  "url": "https://example.com/api",
  "headers": { "Authorization": "Bearer ..." },
  "body": "..."
}
```

### レスポンス

```json
{
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "body": "...",
  "responseTime": 123,
  "size": 456
}
```

### 実装上の注意点

- `ReadableStream` の全チャンクを手動で結合し、チャンク転送エンコーディング（chunked transfer encoding）に対応する。
- `cache: 'no-store'` を指定して Next.js のフェッチキャッシュを無効化する。

---

## 8. コーディング規約・注意事項

### TypeScript

- `strict` モードを有効にする。
- `any` の使用は避け、型を明示する。
- 全ての共通型は `lib/types.ts` に集約する。

### React / コンポーネント

- 全コンポーネントは関数コンポーネント + Hooks で実装する。
- `page.tsx` / `layout.tsx` 以外は必ず `'use client'` を先頭に宣言する。
- 状態管理は `useState` / `useEffect` のみ使用し、Zustand・Redux 等の外部ライブラリは導入しない。
- `useEffect` の依存配列は必ず正確に記述する。

### Tailwind CSS v4

- `globals.css` での読み込みは `@import "tailwindcss"` 構文を使用する（`@tailwind` ディレクティブは使用しない）。
- ダークモードは `@custom-variant dark` で定義する。
- CSS 変数でダークテーマカラーを管理する（例：`--color-bg-base: #080c14`）。
- インラインスタイルは使用せず、Tailwind クラスで記述する。

### スタイリング・テーマ

- ベース背景: `#080c14`
- サーフェス: `#0d1117`
- アクセント: インジゴ-500（`indigo-500`）
- 新しい色を追加する場合は CSS 変数として `globals.css` に定義する。

### コメント

- コメントは必要最小限に留める。自明なコードにはコメントを付けない。

### ID 生成

- ID の生成には必ず `genId()` を使用する（`crypto.randomUUID()` ラッパー）。

---

## 9. 新機能追加時のガイドライン

1. **型定義を先に更新する**: 新しいデータ構造は必ず `lib/types.ts` に追加してからコンポーネントを実装する。
2. **ストレージ変更時はマイグレーションを考慮する**: 既存の localStorage データとの後方互換性を保つか、読み込み時のマイグレーション処理を追加する。
3. **カテゴリー継承に影響する変更**: `lib/inheritance.ts` のロジックを変更する場合は、優先度ルール（ルートが最強）を維持する。
4. **新コンポーネント**: `components/` に配置し、先頭に `'use client'` を宣言する。props の型はインターフェースとして同ファイル内か `lib/types.ts` に定義する。
5. **外部 API へのリクエスト**: 直接 `fetch` せず、必ず `/api/proxy` 経由で送信して CORS を回避する。
6. **localStorage 操作**: 直接 `localStorage` を操作せず、`lib/storage.ts` の関数を通じて行う。
7. **ダークテーマ**: 新しい UI 要素にはダークテーマ対応の Tailwind クラスを使用し、明るい背景色は使用しない。
