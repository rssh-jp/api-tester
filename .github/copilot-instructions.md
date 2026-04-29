# Copilot Instructions — api-tester

## 1. プロジェクト概要・目的

Talend API Tester ライクな REST API テストツール。ブラウザ上で HTTP リクエストを組み立て・送信し、レスポンスを確認できる。カテゴリーツリーによるリクエスト管理、カテゴリー間のヘッダー/パラメータ/変数継承、リクエスト履歴保存を提供する。サーバー DB は不使用で、全データをブラウザの **IndexedDB** に永続化する。

---

## 2. 技術スタック詳細

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16.2.4（App Router、Turbopack） |
| UI | React 19 + TypeScript |
| スタイリング | Tailwind CSS v4（`@import "tailwindcss"` 構文） |
| ダークテーマ | ディープスペースダーク：`#080c14` ベース、`#0d1117` サーフェス、インジゴ-500 アクセント |
| 状態管理 | React `useState` / `useEffect` のみ（Zustand 等のライブラリは不使用） |
| ストレージ | IndexedDB（メインデータ）+ localStorage（カテゴリー展開状態のみ） |
| テスト | Vitest + fake-indexeddb（`lib/` 配下の単体テスト） |

---

## 3. ディレクトリ・ファイル構造

```
src/
  app/
    page.tsx              ルートページ（ApiTester をマウント、Server Component）
    layout.tsx            グローバルレイアウト（Server Component）
    globals.css           Tailwind + ダークテーマ CSS 変数定義
    api/
      proxy/
        route.ts          CORS 回避用プロキシ API Route（Node の http/https/zlib モジュール使用）

  components/
    ApiTester.tsx         メイン状態コンテナ（左右ペイン分割）
    Sidebar.tsx           左ペイン：サイドバー全体（履歴・カテゴリーツリー統合）
    CategoryTree.tsx      カテゴリーツリー（ネスト表示、ドラッグドロップ対応）
    CategoryEditor.tsx    右ペイン：カテゴリー編集（デフォルトヘッダー/パラメータ/変数/継承プレビュー/設定エクスポートインポート）
    UrlBar.tsx            URL 入力 + メソッド選択 + 送信ボタン
    RequestPanel.tsx      リクエスト編集パネル（タブ: Headers / Params / Body）
    ResponsePanel.tsx     レスポンス表示パネル（タブ: Body / Headers）
    BatchRunTab.tsx       カテゴリー配下リクエスト一括実行タブ
    KeyValueTable.tsx     キーバリューペア編集テーブル
    JsonViewer.tsx        JSON Pretty/Raw 表示
    HtmlViewer.tsx        HTML レスポンス表示（iframe サンドボックス）
    XmlViewer.tsx         XML レスポンス表示（シンタックスハイライト）
    ImageViewer.tsx       画像レスポンス表示

  hooks/
    useDragAndDrop.ts     ドラッグドロップ移動ロジック（カテゴリー・リクエスト共用）

  lib/
    types.ts              全共通型定義
    storage.ts            IndexedDB CRUD（カテゴリー、リクエスト、履歴）+ エクスポート/インポート + localStorage 移行処理
    inheritance.ts        カテゴリー継承マージロジック・変数展開
    sendRequest.ts        HTTPリクエスト送信（プロキシ経由 or 直接 fetch）
    urlBuilder.ts         URL + クエリパラメータ構築ユーティリティ

  lib/__tests__/
    setup.ts              Vitest セットアップ（fake-indexeddb/auto）
    inheritance.test.ts   inheritance.ts 単体テスト
    storage.test.ts       storage.ts 単体テスト
    sendRequest.test.ts   sendRequest.ts 単体テスト
    urlBuilder.test.ts    urlBuilder.ts 単体テスト
    useDragAndDrop.test.ts  useDragAndDrop.ts 単体テスト
```

- `page.tsx` と `layout.tsx` のみ Server Component。それ以外の全コンポーネントは `'use client'` を先頭に宣言する。
- 新しいコンポーネントは `components/`、カスタム Hook は `hooks/`、ユーティリティ・型は `lib/` に配置する。

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
  /** レスポンスの Content-Type（例: "application/json", "image/png"） */
  contentType?: string
  /** サーバーがリダイレクトした場合 true */
  redirected?: boolean
  /** リダイレクト後の最終 URL */
  finalUrl?: string
  /** バイナリレスポンスの場合 true（body は空文字） */
  isBinary?: boolean
  /** 実際に送信した完全な URL（マージ済みパラメータを含む） */
  sentUrl?: string
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
  parentId: string | null        // null = ルートレベル
  defaultHeaders: KeyValuePair[]
  defaultParams: KeyValuePair[]
  /** ${KEY} プレースホルダーで URL・ヘッダー・パラメータ・ボディに展開される変数 */
  variables: KeyValuePair[]
  description?: string
  createdAt: number
}

interface SavedRequest {
  id: string
  name: string
  categoryId: string | null      // null = カテゴリーなし
  request: RequestState
  createdAt: number
}

type Selection =
  | { type: 'request'; id: string }
  | { type: 'category'; id: string }
  | null

type BatchRunStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped'

interface BatchRunResult {
  requestId: string
  requestName: string
  categoryName?: string          // 属するカテゴリー名（任意）
  method: HttpMethod
  url: string
  status: BatchRunStatus
  httpStatus?: number
  httpStatusText?: string
  responseTime?: number
  error?: string
}

interface ExportData {
  version: 1                     // スキーマバージョン（現在は固定値 1）
  exportedAt: number             // エクスポート日時（Unix ms）
  categories: Category[]
  requests: SavedRequest[]
}

type DragPhase = 'idle' | 'pressing' | 'dragging'

interface DragItem {
  type: 'category' | 'request'
  id: string
  name: string
  method?: string
}

type DropTarget =
  | { type: 'category'; id: string }
  | { type: 'root' }
  | null
```

- ID 生成には必ず `genId()` を使用する（`Date.now().toString(36) + Math.random().toString(36).slice(2)` による一意文字列）。

---

## 5. カテゴリー継承の仕組み（lib/inheritance.ts）

### 関数一覧

| 関数 | 説明 |
|------|------|
| `buildCategoryChain(categoryId, categories)` | 指定カテゴリーから祖先へのチェーンを返す `[immediate, parent, ..., root]` |
| `mergeKeyValues(requestValues, chain, field)` | ヘッダー/パラメータをマージして最終値を返す |
| `computeEffectiveValues(requestHeaders, requestParams, categoryId, categories)` | マージ済みヘッダー＋パラメータを返す |
| `computeEffectiveVariables(categoryId, categories)` | 継承チェーン上の変数をマージして返す |
| `applyVariables(text, variables)` | `${KEY}` プレースホルダーを変数値で置換する |

### 優先度ルール（ヘッダー・パラメータ）

```
リクエスト固有値（最強）→ 直近カテゴリー → 中間カテゴリー → ルートカテゴリー（最弱）
```

- **リクエスト自身の値が最優先**される。カテゴリーはデフォルト値を提供するだけで、リクエストが同じキーを持つ場合は上書きされる。
- `enabled: false` のエントリはマージ結果から除外する。

### 優先度ルール（変数）

```
直近カテゴリー（最強）→ 中間カテゴリー → ルートカテゴリー（最弱）
```

- **子カテゴリーの変数が親の同名変数を上書き**する（ヘッダー/パラメータとは逆）。

---

## 6. ストレージ設計（lib/storage.ts）

### IndexedDB（データベース: `api-tester-db` v1）

| オブジェクトストア | 内容 |
|------|------|
| `history` | `HistoryItem[]`（timestamp インデックスあり、最新 50 件） |
| `saved` | `SavedRequest[]` |
| `categories` | `Category[]` |

### localStorage（同期アクセス）

| キー | 内容 |
|------|------|
| `api-tester-expanded` | カテゴリーツリーの展開状態（`string[]`） |
| `api-tester-idb-migrated` | localStorage → IndexedDB 移行済みフラグ |

### 重要な挙動

- 履歴は最新 50 件のみ保持し、古いものは自動削除する（`addToHistory` 内で制御）。
- `deleteCategory()` はサブカテゴリーとそれに属するリクエストを**カスケード削除**する。
- `duplicateCategory()` はカテゴリーとサブカテゴリー・リクエストを再帰的にコピーする（ルートに `(copy)` サフィックス追加）。
- `exportData()` は全カテゴリー・リクエストを `ExportData` 形式で返す。`importData()` は既存データを全消去してからインポートする。
- `validateExportData(raw)` はインポート前に JSON の形式チェックと型の正規化を行い、不正データを弾く。
- 旧 localStorage データ（`api-tester-history`, `api-tester-saved`, `api-tester-categories`）は初回アクセス時に IndexedDB へ自動マイグレーションし、旧キーを削除する。
- `getCategories()` 読み込み時に `variables` フィールドがない旧データを `variables: []` へ自動マイグレーションする。

---

## 7. HTTP リクエスト送信（lib/sendRequest.ts）

`sendRequest(params)` 関数がすべての HTTP リクエストを担当する。

### 動作モード

| モード | 条件 | 動作 |
|--------|------|------|
| プロキシモード（デフォルト） | `NEXT_PUBLIC_STATIC_EXPORT` が未設定 | `/api/proxy` に POST してサーバー経由でリクエスト |
| 直接モード | `NEXT_PUBLIC_STATIC_EXPORT=true` | ブラウザから直接 `fetch`（CORS 制約あり） |

---

## 8. CORS プロキシの仕組み（app/api/proxy/route.ts）

ブラウザの CORS 制約を回避するため、全ての外部 API リクエストを Next.js API Route 経由で転送する。

### リクエスト（POST `/api/proxy`）

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
  "size": 456,
  "contentType": "application/json",
  "redirected": false,
  "finalUrl": "https://example.com/api"
}
```

### 実装上の注意点

- Node の `http` / `https` モジュールを直接使用して外部リクエストを送信する（Next.js の fetch キャッシュを完全に回避）。
- 最大 10 回のリダイレクトを自動で追跡する（303 レスポンスはメソッドを GET に変換）。
- `Accept-Encoding: gzip, deflate, br` を送信し、`zlib` モジュールで gzip / deflate / Brotli を自動展開する。
- リクエストには `User-Agent`・`Accept`・`Accept-Language`・`Accept-Encoding` のブラウザデフォルトヘッダーが自動付与される（ユーザー指定ヘッダーで上書き可能）。
- レスポンスボディは `Buffer.concat(chunks)` で結合する。

---

## 9. URL 構築ユーティリティ（lib/urlBuilder.ts）

| 関数 | 説明 |
|------|------|
| `buildUrlWithParams(baseUrl, params)` | 有効なクエリパラメータを URL に結合して返す |
| `extractBaseUrl(url)` | クエリ文字列を除いたベース URL を返す |

### 注意点

- URL やパラメータ値に `${...}` プレースホルダーが含まれる場合、`new URL()` によるパーセントエンコードを避けるため文字列結合にフォールバックする。
- `${...}` を含まない場合は `new URL()` を使用して正規化する（不正な URL は文字列結合にフォールバック）。

---

## 10. ドラッグドロップ（hooks/useDragAndDrop.ts）

カテゴリーとリクエストのドラッグドロップ移動を管理するカスタム Hook。

### エクスポート

| シンボル | 説明 |
|------|------|
| `useDragAndDrop(options)` | ドラッグドロップ状態とイベントハンドラを返す Hook |
| `isDescendant(ancestorId, nodeId, categories)` | `nodeId` が `ancestorId` の子孫かどうかを返すユーティリティ |

### Hook の戻り値

| プロパティ | 説明 |
|------|------|
| `phase` | `DragPhase`（`'idle'` / `'pressing'` / `'dragging'`） |
| `dragItem` | ドラッグ中のアイテム（`DragItem \| null`） |
| `dropTarget` | 現在のドロップ先（`DropTarget \| null`） |
| `ghostPos` | ゴースト要素の座標 `{ x, y }` |
| `handlePointerDown` | ポインターダウンイベントハンドラ |
| `isDragSource(id)` | 指定 ID がドラッグ元かどうか |
| `isActiveDropTarget(target)` | 指定ターゲットがアクティブなドロップ先かどうか |
| `isValidTarget(categoryId)` | ドロップ先として有効なカテゴリーかどうか（自身や子孫は無効） |
| `wasJustDragging()` | 直前のポインターアップがドラッグ終了だったかどうか（クリックとの区別用） |
| `isPressingSource(id)` | 指定 ID が長押し待機中かどうか |

### 動作仕様

- 長押し（300 ms）でドラッグ開始、ポインターキャプチャで要素外へのドラッグを追跡する。
- `data-drop-zone-type` / `data-drop-zone-id` 属性で DOM からドロップ先を検出する。
- カテゴリーへのホバー時に 800 ms 後に自動展開する。
- カテゴリーは自身や子孫カテゴリーへはドロップできない（`isDescendant` で検証）。

---

## 11. コーディング規約・注意事項

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

- ID の生成には必ず `genId()` を使用する（`Date.now().toString(36) + Math.random().toString(36).slice(2)`）。
- `crypto.randomUUID()` は使用しない。

---

## 12. 新機能追加時のガイドライン

1. **型定義を先に更新する**: 新しいデータ構造は必ず `lib/types.ts` に追加してからコンポーネントを実装する。
2. **ストレージ変更時はマイグレーションを考慮する**: IndexedDB スキーマ変更はバージョン番号を上げて `onupgradeneeded` で処理する。既存フィールドの追加はデータ読み込み時のデフォルト補完で対応する。
3. **カテゴリー継承に影響する変更**: `lib/inheritance.ts` のロジックを変更する場合は、ヘッダー/パラメータ（ルートが最弱）と変数（子が最強）の優先度の違いを維持する。
4. **新コンポーネント**: `components/` に配置し、先頭に `'use client'` を宣言する。props の型はインターフェースとして同ファイル内か `lib/types.ts` に定義する。
5. **外部 API へのリクエスト**: `lib/sendRequest.ts` の `sendRequest()` を使用する。直接 `fetch` せず、プロキシ経由（デフォルト）または `NEXT_PUBLIC_STATIC_EXPORT=true` の直接モードで送信する。
6. **ストレージ操作**: 直接 `indexedDB` や `localStorage` を操作せず、`lib/storage.ts` のエクスポート関数を通じて行う。
7. **ダークテーマ**: 新しい UI 要素にはダークテーマ対応の Tailwind クラスを使用し、明るい背景色は使用しない。
8. **単体テスト**: `lib/` に新しいユーティリティ関数を追加した場合、対応するテストを `lib/__tests__/` に作成する。
