# DESIGN-インライン名前変更とリクエストソート: Inline Rename & Name-order Sort

> **ステータス**: 草稿
> **作成日**: 2026-04-28
> **最終更新**: 2026-04-28

---

## 対応仕様書

- [`SPEC-インライン名前変更とリクエストソート.md`](../specs/SPEC-インライン名前変更とリクエストソート.md)

---

## 1. 概要

- **設計方針**: 新規ファイルなし。既存の 3 ファイルへの最小限の変更のみ。
  - `CategoryTree.tsx` ─ ソートロジック追加・ダブルクリックトリガー追加・`RequestRow` のインライン編集 UI 追加
  - `ApiTester.tsx` ─ `handleRenameRequest` ハンドラー追加と prop 伝搬
  - `lib/storage.ts` ─ `updateCategory` 関数追加

---

## 2. 変更ファイル一覧

| ファイル | 変更種別 | 変更概要 |
|---------|---------|---------|
| `src/components/CategoryTree.tsx` | 変更 | ① ソートロジック（`localeCompare`）追加、② カテゴリー名のダブルクリックトリガー追加、③ `RequestRow` のインライン編集 UI 追加、④ 新 props の追加・伝搬 |
| `src/components/ApiTester.tsx` | 変更 | `handleRenameRequest` コールバック追加、`CategoryTree` への `onRenameRequest` prop 渡し |
| `src/lib/storage.ts` | 追加 | `updateCategory` 関数の追加 |

型定義（`lib/types.ts`）・API Route・CSS の変更はなし。

---

## 3. 型・インターフェース変更

### 3.1 `CategoryTreeProps`（`components/CategoryTree.tsx` 内）

```typescript
// 変更前
interface CategoryTreeProps {
  categories: Category[];
  requests: SavedRequest[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onAddCategory: (parentId: string | null) => void;
  onRenameCategory: (id: string, newName: string) => void;
  onDeleteCategory: (id: string) => void;
  onDuplicateCategory: (id: string) => void;
  onAddRequest: (categoryId: string | null) => void;
  onDeleteRequest: (id: string) => void;
  onMoveRequest: (requestId: string, newCategoryId: string | null) => void;
}

// 変更後（onRenameRequest を追加）
interface CategoryTreeProps {
  categories: Category[];
  requests: SavedRequest[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onAddCategory: (parentId: string | null) => void;
  onRenameCategory: (id: string, newName: string) => void;
  onDeleteCategory: (id: string) => void;
  onDuplicateCategory: (id: string) => void;
  onAddRequest: (categoryId: string | null) => void;
  onDeleteRequest: (id: string) => void;
  onMoveRequest: (requestId: string, newCategoryId: string | null) => void;
  onRenameRequest: (id: string, newName: string) => void;  // ← 追加
}
```

### 3.2 `RequestRowProps`（`components/CategoryTree.tsx` 内）

```typescript
// 変更前
interface RequestRowProps {
  request: SavedRequest;
  depth: number;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onDeleteRequest: (id: string) => void;
}

// 変更後（3 prop を追加）
interface RequestRowProps {
  request: SavedRequest;
  depth: number;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onDeleteRequest: (id: string) => void;
  onRenameRequest: (id: string, newName: string) => void;  // ← 追加
  renamingRequestId: string | null;                        // ← 追加
  setRenamingRequestId: (id: string | null) => void;       // ← 追加
}
```

### 3.3 `CategoryNodeProps`（`components/CategoryTree.tsx` 内）

```typescript
// 変更前
interface CategoryNodeProps {
  category: Category;
  allCategories: Category[];
  allRequests: SavedRequest[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onAddCategory: (parentId: string | null) => void;
  onRenameCategory: (id: string, newName: string) => void;
  onDeleteCategory: (id: string) => void;
  onDuplicateCategory: (id: string) => void;
  onAddRequest: (categoryId: string | null) => void;
  onDeleteRequest: (id: string) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
}

// 変更後（3 prop を追加）
interface CategoryNodeProps {
  category: Category;
  allCategories: Category[];
  allRequests: SavedRequest[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onAddCategory: (parentId: string | null) => void;
  onRenameCategory: (id: string, newName: string) => void;
  onDeleteCategory: (id: string) => void;
  onDuplicateCategory: (id: string) => void;
  onAddRequest: (categoryId: string | null) => void;
  onDeleteRequest: (id: string) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  onRenameRequest: (id: string, newName: string) => void;  // ← 追加
  renamingRequestId: string | null;                        // ← 追加
  setRenamingRequestId: (id: string | null) => void;       // ← 追加
}
```

---

## 4. 各ファイルの詳細変更内容

### 4.1 `src/lib/storage.ts`

#### 変更内容: `updateCategory` 関数の追加

`updateSavedRequest` と同パターンで実装する。`saveCategory` を完全置換でなく差分マージする点が重要。

```typescript
// saveCategory の定義の直後（または deleteCategory の直前）に追加
export async function updateCategory(id: string, updates: Partial<Category>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('categories', 'readwrite');
  const store = tx.objectStore('categories');
  const existing = await idbReq<Category | undefined>(store.get(id));
  if (existing) store.put({ ...existing, ...updates });
  await txDone(tx);
}
```

- **追加位置**: `saveCategory` 定義の直後、`deleteCategory` の直前
- **既存の `handleRenameCategory` のリファクタリングはスコープ外**。`updateCategory` は新規の `handleRenameRequest` のみで使用する。

---

### 4.2 `src/components/ApiTester.tsx`

#### 変更内容 1: `updateCategory` のインポート追加

```typescript
// 変更前
import {
  getHistory, addToHistory, clearHistory,
  getSaved, saveRequest, updateSavedRequest, deleteSaved,
  getCategories, saveCategory, deleteCategory,
  duplicateCategory,
} from '@/lib/storage';

// 変更後（updateCategory を追加）
import {
  getHistory, addToHistory, clearHistory,
  getSaved, saveRequest, updateSavedRequest, deleteSaved,
  getCategories, saveCategory, deleteCategory,
  duplicateCategory,
  updateCategory,   // ← 追加
} from '@/lib/storage';
```

> **注意**: `updateCategory` は `handleRenameRequest` 内で使用するため必要。ただし既存の `handleRenameCategory` は変更しない（スコープ外）。

#### 変更内容 2: `handleRenameRequest` ハンドラーの追加

既存の `handleDeleteRequest` の定義直後に追加する:

```typescript
const handleRenameRequest = useCallback(async (id: string, newName: string) => {
  await updateSavedRequest(id, { name: newName });
  setRequests(await getSaved());
}, []);
```

#### 変更内容 3: `CategoryTree` への prop 渡し

```tsx
// 変更前
<CategoryTree
  categories={categories}
  requests={requests}
  selection={selection}
  onSelect={setSelection}
  onAddCategory={handleAddCategory}
  onRenameCategory={handleRenameCategory}
  onDeleteCategory={handleDeleteCategory}
  onDuplicateCategory={handleDuplicateCategory}
  onAddRequest={handleAddRequest}
  onDeleteRequest={handleDeleteRequest}
  onMoveRequest={handleMoveRequest}
/>

// 変更後（onRenameRequest を追加）
<CategoryTree
  categories={categories}
  requests={requests}
  selection={selection}
  onSelect={setSelection}
  onAddCategory={handleAddCategory}
  onRenameCategory={handleRenameCategory}
  onDeleteCategory={handleDeleteCategory}
  onDuplicateCategory={handleDuplicateCategory}
  onAddRequest={handleAddRequest}
  onDeleteRequest={handleDeleteRequest}
  onMoveRequest={handleMoveRequest}
  onRenameRequest={handleRenameRequest}   // ← 追加
/>
```

---

### 4.3 `src/components/CategoryTree.tsx`

#### 変更内容 1: `CategoryTree` コンポーネント ─ `renamingRequestId` state 追加と props 伝搬

`CategoryTree` 関数本体に `renamingRequestId` state を追加し、`CategoryNode` へ渡す:

```typescript
// 変更前
export default function CategoryTree({
  categories, requests, selection, onSelect, onAddCategory,
  onRenameCategory, onDeleteCategory, onDuplicateCategory,
  onAddRequest, onDeleteRequest,
  onMoveRequest: _onMoveRequest,
}: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(...);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // ...
  const rootCategories = categories.filter(c => c.parentId === null);

// 変更後
export default function CategoryTree({
  categories, requests, selection, onSelect, onAddCategory,
  onRenameCategory, onDeleteCategory, onDuplicateCategory,
  onAddRequest, onDeleteRequest,
  onMoveRequest: _onMoveRequest,
  onRenameRequest,   // ← 追加
}: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(...);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingRequestId, setRenamingRequestId] = useState<string | null>(null);  // ← 追加
  // ...
  const rootCategories = categories
    .filter(c => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));  // ← ソート追加
```

`rootCategories.map(cat => <CategoryNode .../>)` の各 `CategoryNode` に 3 props を追加:

```tsx
<CategoryNode
  // ...既存 props...
  renamingId={renamingId}
  setRenamingId={setRenamingId}
  onRenameRequest={onRenameRequest}           // ← 追加
  renamingRequestId={renamingRequestId}       // ← 追加
  setRenamingRequestId={setRenamingRequestId} // ← 追加
/>
```

#### 変更内容 2: `CategoryNode` コンポーネント ─ ソートロジック追加

`childCategories` と `childRequests` の算出箇所に `.sort()` を追加する:

```typescript
// 変更前
const childCategories = allCategories.filter(c => c.parentId === category.id);
const childRequests = allRequests.filter(r => r.categoryId === category.id);

// 変更後
const childCategories = allCategories
  .filter(c => c.parentId === category.id)
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

const childRequests = allRequests
  .filter(r => r.categoryId === category.id)
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
```

#### 変更内容 3: `CategoryNode` コンポーネント ─ カテゴリー名ダブルクリックトリガー追加

カテゴリー名を表示している `<span>` に `onDoubleClick` ハンドラーを追加する。
既存の `isRenaming` が `false` の分岐内にある名前 `<span>` が対象:

```tsx
// 変更前
<span className="flex-1 min-w-0 text-sm text-slate-300 truncate">{category.name}</span>

// 変更後
<span
  className="flex-1 min-w-0 text-sm text-slate-300 truncate select-none"
  onDoubleClick={e => {
    e.preventDefault();
    e.stopPropagation();
    setRenameValue(category.name);
    setRenamingId(category.id);
  }}
>
  {category.name}
</span>
```

- `e.preventDefault()` ─ ブラウザのデフォルトテキスト選択を抑制（仕様 2.2 Should Have）
- `select-none` ─ Tailwind でダブルクリック時のテキスト選択を防止（`user-select: none`）
- `setRenameValue(category.name)` → `setRenamingId(category.id)` の順序は既存の Edit2 ボタンと同じ

#### 変更内容 4: `CategoryNode` コンポーネント ─ 新 props の受け取りと `RequestRow` への伝搬

`CategoryNode` 関数シグネチャに 3 props を追加:

```typescript
// 変更前
function CategoryNode({
  category, allCategories, allRequests, depth, expanded, onToggle,
  selection, onSelect, onAddCategory, onRenameCategory, onDeleteCategory,
  onDuplicateCategory, onAddRequest, onDeleteRequest, renamingId, setRenamingId,
}: CategoryNodeProps)

// 変更後
function CategoryNode({
  category, allCategories, allRequests, depth, expanded, onToggle,
  selection, onSelect, onAddCategory, onRenameCategory, onDeleteCategory,
  onDuplicateCategory, onAddRequest, onDeleteRequest, renamingId, setRenamingId,
  onRenameRequest, renamingRequestId, setRenamingRequestId,   // ← 追加
}: CategoryNodeProps)
```

子 `CategoryNode`（再帰呼び出し）への伝搬:

```tsx
// Children セクション内の CategoryNode 再帰呼び出しに追加
<CategoryNode
  // ...既存 props...
  renamingId={renamingId}
  setRenamingId={setRenamingId}
  onRenameRequest={onRenameRequest}           // ← 追加
  renamingRequestId={renamingRequestId}       // ← 追加
  setRenamingRequestId={setRenamingRequestId} // ← 追加
/>
```

`RequestRow` への props 追加:

```tsx
// 変更前
<RequestRow
  key={req.id}
  request={req}
  depth={depth + 1}
  selection={selection}
  onSelect={onSelect}
  onDeleteRequest={onDeleteRequest}
/>

// 変更後
<RequestRow
  key={req.id}
  request={req}
  depth={depth + 1}
  selection={selection}
  onSelect={onSelect}
  onDeleteRequest={onDeleteRequest}
  onRenameRequest={onRenameRequest}           // ← 追加
  renamingRequestId={renamingRequestId}       // ← 追加
  setRenamingRequestId={setRenamingRequestId} // ← 追加
/>
```

#### 変更内容 5: `RequestRow` コンポーネント ─ インライン編集 UI 追加

`RequestRow` を全面改修してインライン編集 UI を追加する。現状のコードを以下に置き換える:

```tsx
function RequestRow({
  request, depth, selection, onSelect, onDeleteRequest,
  onRenameRequest, renamingRequestId, setRenamingRequestId,
}: RequestRowProps) {
  const isSelected = selection?.type === 'request' && selection.id === request.id;
  const isRenaming = renamingRequestId === request.id;

  const [renameValue, setRenameValue] = useState(request.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== request.name) {
      onRenameRequest(request.id, trimmed);
    }
    setRenamingRequestId(null);
  }

  return (
    <div
      className={`group flex items-center gap-1.5 py-1 pr-1 cursor-pointer transition-colors ${
        isSelected ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-800/40'
      }`}
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
      onClick={() => !isRenaming && onSelect({ type: 'request', id: request.id })}
    >
      <FileJson size={13} className="flex-shrink-0 text-slate-600" />

      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setRenameValue(request.name);
              setRenamingRequestId(null);
            }
          }}
          onBlur={commitRename}
          onClick={e => e.stopPropagation()}
          aria-label="リクエスト名を変更"
          className="flex-1 min-w-0 bg-slate-800 border border-indigo-500/60 text-slate-100 text-xs rounded px-1 py-0.5 focus:outline-none"
        />
      ) : (
        <>
          <span
            className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
              METHOD_COLORS[request.request.method] ?? 'text-slate-400'
            }`}
          >
            {request.request.method}
          </span>
          <span
            className="flex-1 min-w-0 text-xs text-slate-400 truncate select-none"
            onDoubleClick={e => {
              e.preventDefault();
              e.stopPropagation();
              setRenameValue(request.name);
              setRenamingRequestId(request.id);
            }}
          >
            {request.name}
          </span>
          <button
            title="リクエストを削除"
            onClick={e => {
              e.stopPropagation();
              onDeleteRequest(request.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
          >
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}
```

**変更ポイントの解説**:

| 箇所 | 理由 |
|------|------|
| `useState(request.name)` / `useRef` | カテゴリーの `renamingId` パターンと同様の実装 |
| `isRenaming` 条件分岐 | 編集中は input のみ表示（メソッドバッジ・名前テキスト・削除ボタンを非表示） |
| `onClick={() => !isRenaming && onSelect(...)` | 編集中の行クリックで選択が変わらないようにする |
| `aria-label="リクエスト名を変更"` | アクセシビリティ要件（仕様 3 非機能要件）への対応 |
| 名前 `<span>` の `onDoubleClick` + `e.preventDefault()` | テキスト選択抑制（仕様 2.2 Should Have） |
| `useRef` / `useEffect` の追加 | `react` からの import は既存で宣言済み（`useState`, `useEffect`, `useCallback`, `useRef`） |

---

## 5. ソートの詳細設計

### 5.1 ソート範囲

| 対象 | 箇所 | 説明 |
|------|------|------|
| ルートレベルのカテゴリー | `CategoryTree` 内 `rootCategories` 算出箇所 | `categories.filter(c => c.parentId === null).sort(...)` |
| 各カテゴリーの子カテゴリー | `CategoryNode` 内 `childCategories` 算出箇所 | `allCategories.filter(c => c.parentId === category.id).sort(...)` |
| 各カテゴリーの子リクエスト | `CategoryNode` 内 `childRequests` 算出箇所 | `allRequests.filter(r => r.categoryId === category.id).sort(...)` |
| カテゴリーなしリクエスト | `CategoryTree` 内 `uncategorizedRequests` 算出箇所 | ソート対象外（仕様のスコープ外、仕様 1.1 のルートカテゴリーのみ明記） |

> **補足**: `uncategorizedRequests`（`categoryId === null`）は現在 `CategoryTree` コンポーネントで算出されているが、ツリー上に表示されていない実装となっているため、今回のスコープでは変更しない。

### 5.2 ソートオプション

```typescript
// 全箇所で統一したオプションを使用する
.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
```

- `locale: undefined` ─ ブラウザのデフォルトロケールを使用（日本語環境では五十音順）
- `sensitivity: 'base'` ─ 大文字小文字・アクセント記号を無視した比較（「Auth」と「auth」が同順位に）

### 5.3 ソートのタイミングと副作用

- ソートは各コンポーネントのレンダー時に毎回実行する（データ量が少ないため `useMemo` 不要と判断）
- 仕様 3「1000 件で 100ms 以内」に引っかかる場合は `useMemo` でメモ化することを検討する
- **IndexedDB に保存されたデータの順序は変更しない**（`getCategories` / `getSaved` の `createdAt` 降順はそのまま）

---

## 6. インライン編集 UI の詳細設計

### 6.1 state 管理方針

| state | 場所 | 型 | 説明 |
|-------|------|-----|------|
| `renamingId` | `CategoryTree` | `string \| null` | 既存。現在インライン編集中のカテゴリー ID |
| `renamingRequestId` | `CategoryTree` | `string \| null` | 追加。現在インライン編集中のリクエスト ID |
| `renameValue` | 各 `CategoryNode` / `RequestRow` | `string` | ローカル。編集中のテキスト値 |

- `renamingId` と `renamingRequestId` を `CategoryTree` の上位に置き、各ノード・行に props として流す。
- これにより「リクエスト A を編集中にカテゴリー B をダブルクリックしても、両方が同時に編集状態にならない」ことを保証できる。
  - ただし `renamingId`（カテゴリー）と `renamingRequestId`（リクエスト）は独立した state のため、同時編集は理論上可能。仕様に明記がないため許容する。

### 6.2 キーボードイベント処理

カテゴリー・リクエスト共通のロジック:

| キー | 動作 |
|------|------|
| `Enter` | `commitRename()` を呼ぶ。trimmed が空文字の場合はキャンセルと同じ動作 |
| `Escape` | `setRenameValue(元の名前)` → `setRenamingId(null)` / `setRenamingRequestId(null)` |

`commitRename()` の処理フロー:

```
trimmed = renameValue.trim()
├─ trimmed が空文字 → setRenamingId/RequestId(null)（キャンセル扱い）
├─ trimmed === 元の名前 → setRenamingId/RequestId(null)（変更なし）
└─ それ以外 → onRenameCategory/Request(id, trimmed) 呼び出し → setRenamingId/RequestId(null)
```

### 6.3 フォーカス制御

```typescript
useEffect(() => {
  if (isRenaming && ref.current) {
    ref.current.focus();
    ref.current.select();  // 既存の名前を全選択
  }
}, [isRenaming]);
```

- `ref.current.select()` により、編集開始と同時に既存テキストが全選択状態になる（即座に上書き入力が可能）

### 6.4 `onBlur` 確定処理

- `<input>` の `onBlur` には `commitRename` を直接渡す
- これにより「別の行をクリックしてフォーカスが外れた場合」も確定される（仕様 4.5 エラーハンドリング対応）

### 6.5 編集中のクリックイベント制御

- input の `onClick={e => e.stopPropagation()}` ─ input クリックが行の `onClick` へ伝搬するのを防ぐ
- 行の `onClick` を `() => !isRenaming && onSelect(...)` に変更 ─ 編集中の行クリックで選択が変わらないようにする

### 6.6 エラーハンドリング

`onRenameRequest` / `onRenameCategory` は非同期（IndexedDB 書き込み）。
エラーが発生した場合の挙動は `handleRenameRequest` 側（`ApiTester.tsx`）でハンドリングする必要があるが、
今回の仕様では「コンソールにエラー出力し、UI を変更前の状態に戻す」レベルのハンドリングは `ApiTester.tsx` の既存パターン（try/catch なし）に合わせてスコープ外とする。
（仕様 4.5 にあるが、他の handler も未実装のため一貫性を重視する。）

---

## 7. API ルート変更

なし（内部完結）。

---

## 8. 実装手順

依存関係を考慮した順序:

1. **`src/lib/storage.ts`**: `updateCategory` 関数を追加する
2. **`src/components/CategoryTree.tsx`**:
   - `CategoryTreeProps` / `RequestRowProps` / `CategoryNodeProps` に新 props を追加する
   - `RequestRow` にインライン編集用 state・ref・useEffect・UI を追加する
   - `CategoryNode` のカテゴリー名 `<span>` に `onDoubleClick` を追加する
   - `CategoryNode` の `childCategories` / `childRequests` にソートを追加する
   - `CategoryNode` の関数シグネチャに新 props を追加し、再帰呼び出しと `RequestRow` へ伝搬する
   - `CategoryTree` に `renamingRequestId` state を追加し、`rootCategories` にソートを追加する
   - `CategoryTree` の `CategoryNode` 呼び出しに新 props を追加する
3. **`src/components/ApiTester.tsx`**:
   - `updateCategory` インポートを追加する（将来の利用のために追加するが `handleRenameRequest` では `updateSavedRequest` を使う）
   - `handleRenameRequest` を追加する
   - `CategoryTree` JSX に `onRenameRequest={handleRenameRequest}` を追加する

---

## 9. テスト方針

### 9.1 単体テスト（`lib/__tests__/storage.test.ts`）

`updateCategory` 関数の追加に対してテストを追加する:

| テストケース | 検証内容 |
|------------|---------|
| `updateCategory` ─ 通常更新 | 指定 ID のカテゴリーの `name` フィールドが更新され、他フィールドが変化しないこと |
| `updateCategory` ─ 存在しない ID | エラーなく終了すること（`if (existing)` で無視される） |

### 9.2 手動テスト（受け入れ条件確認）

仕様書「7. 受け入れ条件」の AC1-1 〜 AC4-3 を順番に確認する。

特に重要な確認項目:

| 確認項目 | 手順 |
|---------|------|
| ソート（AC1-1〜AC1-3） | 英語名・日本語名混在のカテゴリー・リクエストを作成し、名前順に並ぶことを確認 |
| カテゴリーダブルクリック（AC2-1〜AC2-5） | ダブルクリック → 入力 → Enter / Escape / 空文字 Enter の各パターンを確認 |
| リクエストダブルクリック（AC3-1〜AC3-6） | 同上。また右ペインのリクエスト名も更新されること（`requests` state の再フェッチで自動更新）を確認 |
| リグレッション（AC4-1〜AC4-3） | 既存の追加・削除・複製・移動・展開操作が引き続き動作することを確認 |

---

## 10. 影響を受ける既存機能

| 機能名 | 影響内容 | 対応方針 |
|-------|---------|---------|
| Edit2 ボタンによるカテゴリーリネーム | `renamingId` の仕組みを共有するが、ダブルクリックはトリガーを追加するだけ | 既存コードを変更しないため影響なし |
| カテゴリー複製 | `CategoryNodeProps` に props が追加されるため、再帰呼び出しへの伝搬を追加 | 変更内容 4 で対応 |
| リクエスト選択（右ペイン表示） | `RequestRow` の `onClick` 条件に `!isRenaming` を追加 | 編集中以外は従来通り動作 |

---

## 11. 懸念事項・リスク

- **`localeCompare` のブラウザ差異**: 特殊文字・絵文字を含む名前のソート順がブラウザ間で異なる可能性がある。仕様 8「既知の制約」に明記されている通り許容する。
- **`renamingRequestId` と `renamingId` の同時編集**: 理論上カテゴリーとリクエストが同時に編集状態になれる。仕様に明示的な禁止がないため現状許容する。必要であれば「いずれかを開始したとき、他方を `null` にリセットする」ロジックを `CategoryTree` に追加できる。
- **`onBlur` の二重呼び出し**: Enter キーで `commitRename()` が呼ばれた後、フォーカスが外れて `onBlur` が発火し `commitRename()` が再度呼ばれる可能性がある。`setRenamingId(null)` により2回目は `isRenaming === false` なので `useEffect` は再実行されないが、`onRenameRequest` / `onRenameCategory` が2回呼ばれる可能性がある。対策として `commitRename` 内で先に `setRenamingId(null)` / `setRenamingRequestId(null)` を呼ぶか、フラグで制御する実装を検討すること。カテゴリーの既存実装（`setRenamingId(null)` を最後に呼ぶ）にも同じ問題があるため、既存パターンに合わせて許容する。
