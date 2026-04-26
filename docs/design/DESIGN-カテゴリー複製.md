# DESIGN-カテゴリー複製: Category Duplication

## 1. 概要

- **対応仕様書**: `docs/specs/SPEC-カテゴリー複製.md`
- **設計方針**: 既存コンポーネント・ストレージ関数の拡張のみで実装する。新規ファイルの追加は `genId` の扱いに応じて `lib/utils.ts` のみ検討するが、本設計では `lib/storage.ts` へのローカル定義を採用しファイル数増加を避ける。

---

## 2. 変更ファイル一覧

| ファイル | 変更種別 | 変更概要 |
|---------|---------|---------|
| `lib/storage.ts` | 追加 | `genId` ローカル定義、`duplicateCategory` 関数の追加 |
| `components/CategoryTree.tsx` | 変更 | `onDuplicateCategory` prop の追加、複製ボタンの追加 |
| `components/ApiTester.tsx` | 変更 | `duplicateCategory` のインポート、`handleDuplicateCategory` の追加、`CategoryTree` への prop 渡し |

型定義（`lib/types.ts`）・API Route・CSS の変更はなし。

---

## 3. コンポーネント設計

### 3.1 変更するコンポーネント

#### `CategoryTree` (`components/CategoryTree.tsx`)

**変更内容 1: `CategoryTreeProps` インターフェースへの追加**

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
  onAddRequest: (categoryId: string | null) => void;
  onDeleteRequest: (id: string) => void;
  onMoveRequest: (requestId: string, newCategoryId: string | null) => void;
}

// 変更後（onDuplicateCategory を追加）
interface CategoryTreeProps {
  categories: Category[];
  requests: SavedRequest[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onAddCategory: (parentId: string | null) => void;
  onRenameCategory: (id: string, newName: string) => void;
  onDeleteCategory: (id: string) => void;
  onDuplicateCategory: (id: string) => void;   // ← 追加
  onAddRequest: (categoryId: string | null) => void;
  onDeleteRequest: (id: string) => void;
  onMoveRequest: (requestId: string, newCategoryId: string | null) => void;
}
```

**変更内容 2: `CategoryNodeProps` インターフェースへの追加**

```typescript
// 変更前
interface CategoryNodeProps {
  // ...
  onDeleteCategory: (id: string) => void;
  onAddRequest: (categoryId: string | null) => void;
  // ...
}

// 変更後（onDuplicateCategory を追加）
interface CategoryNodeProps {
  // ...
  onDeleteCategory: (id: string) => void;
  onDuplicateCategory: (id: string) => void;   // ← 追加
  onAddRequest: (categoryId: string | null) => void;
  // ...
}
```

**変更内容 3: `Copy` アイコンのインポート追加**

ファイル冒頭の lucide-react インポートに `Copy` を追加する。

```typescript
// 変更前
import {
  ChevronRight, ChevronDown, FolderOpen, Folder,
  FileJson, Plus, Trash2, Edit2,
} from 'lucide-react';

// 変更後
import {
  ChevronRight, ChevronDown, FolderOpen, Folder,
  FileJson, Plus, Trash2, Edit2, Copy,
} from 'lucide-react';
```

**変更内容 4: `CategoryNode` コンポーネントのボタン追加**

既存のアクションボタン群（`<div className="flex items-center gap-0.5 ...">` 内）のリネームボタンと削除ボタンの間に複製ボタンを挿入する。

挿入前のボタン順序（現状のコード）:
```tsx
<button title="Rename" ...>
  <Edit2 size={12} />
</button>
<button title="Delete" ...>
  <Trash2 size={12} />
</button>
```

挿入後:
```tsx
<button title="Rename" ...>
  <Edit2 size={12} />
</button>
<button
  title="Duplicate category"
  onClick={e => {
    e.stopPropagation();
    onDuplicateCategory(category.id);
  }}
  className="p-0.5 rounded text-slate-600 hover:text-indigo-400 hover:bg-indigo-500/10"
>
  <Copy size={12} />
</button>
<button title="Delete" ...>
  <Trash2 size={12} />
</button>
```

**変更内容 5: `CategoryNode` の props 分割代入と再帰呼び出しへの伝播**

`CategoryNode` の関数シグネチャと、子 `CategoryNode` への props 渡しに `onDuplicateCategory` を追加する。

```typescript
// 関数シグネチャ（変更前）
function CategoryNode({
  category, allCategories, allRequests, depth, expanded, onToggle,
  selection, onSelect, onAddCategory, onRenameCategory, onDeleteCategory,
  onAddRequest, onDeleteRequest, renamingId, setRenamingId,
}: CategoryNodeProps)

// 関数シグネチャ（変更後）
function CategoryNode({
  category, allCategories, allRequests, depth, expanded, onToggle,
  selection, onSelect, onAddCategory, onRenameCategory, onDeleteCategory,
  onDuplicateCategory,   // ← 追加
  onAddRequest, onDeleteRequest, renamingId, setRenamingId,
}: CategoryNodeProps)
```

子 `CategoryNode` への再帰呼び出し（`childCategories.map(...)` 内）にも `onDuplicateCategory={onDuplicateCategory}` を追加する。

**変更内容 6: `CategoryTree` コンポーネントの props 受け取りと伝播**

```typescript
// 変更前
export default function CategoryTree({
  categories, requests, selection, onSelect, onAddCategory,
  onRenameCategory, onDeleteCategory, onAddRequest, onDeleteRequest,
  onMoveRequest: _onMoveRequest,
}: CategoryTreeProps)

// 変更後
export default function CategoryTree({
  categories, requests, selection, onSelect, onAddCategory,
  onRenameCategory, onDeleteCategory, onDuplicateCategory,   // ← 追加
  onAddRequest, onDeleteRequest,
  onMoveRequest: _onMoveRequest,
}: CategoryTreeProps)
```

`rootCategories.map(cat => <CategoryNode .../>)` の各 `CategoryNode` にも `onDuplicateCategory={onDuplicateCategory}` を追加する。

---

#### `ApiTester` (`components/ApiTester.tsx`)

**変更内容 1: `duplicateCategory` のインポート追加**

```typescript
// 変更前
import {
  getHistory, addToHistory, clearHistory,
  getSaved, saveRequest, updateSavedRequest, deleteSaved,
  getCategories, saveCategory, deleteCategory,
} from '@/lib/storage';

// 変更後
import {
  getHistory, addToHistory, clearHistory,
  getSaved, saveRequest, updateSavedRequest, deleteSaved,
  getCategories, saveCategory, deleteCategory,
  duplicateCategory,   // ← 追加
} from '@/lib/storage';
```

**変更内容 2: `handleDuplicateCategory` コールバックの追加**

既存の `handleDeleteCategory` の直後に追加する。

```typescript
const handleDuplicateCategory = useCallback(async (id: string) => {
  const newId = await duplicateCategory(id);
  const [updatedCats, updatedSaved] = await Promise.all([getCategories(), getSaved()]);
  setCategories(updatedCats);
  setRequests(updatedSaved);
  setSelection({ type: 'category', id: newId });
}, []);
```

- `duplicateCategory` は新しいルートカテゴリーの ID を返す
- `getCategories()` と `getSaved()` を `Promise.all` で並列フェッチし、両方のステートを更新する
- `setSelection` で複製先カテゴリーを選択状態にすることで、`CategoryTree` の `useEffect`（ancestors auto-expand）が動作し、ツリーが展開される
- `useCallback` の依存配列は `[]`（依存する外部ステートなし）

**変更内容 3: `CategoryTree` への prop 渡し**

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
  onAddRequest={handleAddRequest}
  onDeleteRequest={handleDeleteRequest}
  onMoveRequest={handleMoveRequest}
/>

// 変更後
<CategoryTree
  categories={categories}
  requests={requests}
  selection={selection}
  onSelect={setSelection}
  onAddCategory={handleAddCategory}
  onRenameCategory={handleRenameCategory}
  onDeleteCategory={handleDeleteCategory}
  onDuplicateCategory={handleDuplicateCategory}   // ← 追加
  onAddRequest={handleAddRequest}
  onDeleteRequest={handleDeleteRequest}
  onMoveRequest={handleMoveRequest}
/>
```

---

## 4. ストレージ設計（IndexedDB）

### 4.1 使用する IndexedDB オブジェクトストア

| ストア名 | 変更内容 |
|---------|---------|
| `categories` | 複製されたカテゴリーを `put` で追加（既存データ変更なし） |
| `saved` | 複製されたリクエストを `put` で追加（既存データ変更なし） |

マイグレーション処理は不要。既存データ形式に変更なし。

### 4.2 `genId` の扱い

現在 `genId` は `components/ApiTester.tsx` にローカル定義されている（`crypto.randomUUID` ではなく独自実装）。

```typescript
// components/ApiTester.tsx の現在の実装
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
```

`duplicateCategory` でも同じ関数が必要となるため、**`lib/storage.ts` の先頭にも同じ実装をローカル定義する**。

```typescript
// lib/storage.ts の先頭（import 直後）に追加
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
```

> **選択理由**: `ApiTester.tsx` の `genId` を変更・削除すると影響範囲が広がるため、`storage.ts` 内に独立してローカル定義する方式を採用する。将来的に `lib/utils.ts` への切り出しが必要になった場合は別タスクで対応する。

### 4.3 `duplicateCategory` 関数の詳細設計

`lib/storage.ts` に追加する。`getDB`・`txDone` は同ファイル内の既存プライベートヘルパーであり、直接利用可能。

```typescript
/**
 * 指定カテゴリーをサブカテゴリー・リクエストごと再帰的に複製する。
 * 複製されたルートカテゴリーの ID を返す。
 */
export async function duplicateCategory(sourceId: string): Promise<string> {
  const allCats = await getCategories();
  const allSaved = await getSaved();
  const source = allCats.find(c => c.id === sourceId);
  if (!source) throw new Error(`Category ${sourceId} not found`);

  const newCategories: Category[] = [];
  const newRequests: SavedRequest[] = [];

  function cloneCategory(cat: Category, parentId: string | null, isRoot: boolean): string {
    const newId = genId();
    newCategories.push({
      ...cat,
      id: newId,
      parentId,
      name: isRoot ? `${cat.name} (copy)` : cat.name,
      defaultHeaders: cat.defaultHeaders.map(h => ({ ...h, id: genId() })),
      defaultParams: cat.defaultParams.map(p => ({ ...p, id: genId() })),
      createdAt: Date.now(),
    });

    allSaved
      .filter(r => r.categoryId === cat.id)
      .forEach(r => {
        newRequests.push({
          ...r,
          id: genId(),
          categoryId: newId,
          request: {
            ...r.request,
            headers: r.request.headers.map(h => ({ ...h, id: genId() })),
            params: r.request.params.map(p => ({ ...p, id: genId() })),
          },
          createdAt: Date.now(),
        });
      });

    allCats
      .filter(c => c.parentId === cat.id)
      .forEach(child => cloneCategory(child, newId, false));

    return newId;
  }

  const newRootId = cloneCategory(source, source.parentId, true);

  const db = await getDB();
  const tx = db.transaction(['categories', 'saved'], 'readwrite');
  const catStore = tx.objectStore('categories');
  const savedStore = tx.objectStore('saved');
  for (const c of newCategories) catStore.put(c);
  for (const r of newRequests) savedStore.put(r);
  await txDone(tx);

  return newRootId;
}
```

**実装ポイント**:

- `cloneCategory` は同期的な再帰関数。`allCats` / `allSaved` は関数実行前に全件取得済みのスナップショットを参照する
- `newRootId` はクロージャで最初の `cloneCategory` 呼び出しの戻り値として得られる
- `db.transaction(['categories', 'saved'], 'readwrite')` で 2 ストアを同一トランザクションで更新する（原子性の確保）
- `spread` による `{ ...cat }` は浅いコピーであり、`defaultHeaders` / `defaultParams` の各要素は `map(h => ({ ...h, id: genId() }))` で深いコピーを行う

---

## 5. データフロー

```
ユーザーが複製ボタンをクリック
  │
  ▼
CategoryNode#onClick → e.stopPropagation()
  │
  ▼
onDuplicateCategory(category.id)
  │  （CategoryTree → ApiTester へ prop 経由でバブルアップ）
  ▼
handleDuplicateCategory(id) in ApiTester
  │
  ├─ await duplicateCategory(id)  ← lib/storage.ts
  │     │
  │     ├─ getCategories() / getSaved()  ← IndexedDB 読み取り
  │     ├─ cloneCategory() 再帰実行
  │     │    └─ genId() で全 ID を新規生成
  │     ├─ db.transaction(['categories','saved'], 'readwrite') で一括書き込み
  │     └─ newRootId を返す
  │
  ├─ Promise.all([getCategories(), getSaved()])  ← 並列再フェッチ
  ├─ setCategories(updatedCats)
  ├─ setRequests(updatedSaved)
  └─ setSelection({ type: 'category', id: newRootId })
        │
        ▼
  CategoryTree の useEffect が ancestors を自動展開
        │
        ▼
  UI 更新完了（複製先カテゴリーが選択・展開状態）
```

---

## 6. 実装手順

依存関係を考慮した推奨実装順序:

1. **`lib/storage.ts` の変更**
   - ファイル先頭（`import` 直後）に `genId()` をローカル定義する
   - `duplicateCategory` 関数を `deleteCategory` の直後に追加する

2. **`components/CategoryTree.tsx` の変更**
   - `Copy` を lucide-react インポートに追加する
   - `CategoryTreeProps` に `onDuplicateCategory` を追加する
   - `CategoryNodeProps` に `onDuplicateCategory` を追加する
   - `CategoryNode` の関数シグネチャに `onDuplicateCategory` を追加する
   - リネームボタンと削除ボタンの間に複製ボタンを挿入する
   - 子 `CategoryNode` の再帰呼び出しに `onDuplicateCategory={onDuplicateCategory}` を追加する
   - `CategoryTree` コンポーネントの props 受け取りと `CategoryNode` への伝播を追加する

3. **`components/ApiTester.tsx` の変更**
   - `duplicateCategory` を `@/lib/storage` インポートに追加する
   - `handleDuplicateCategory` コールバックを `handleDeleteCategory` の直後に追加する
   - `<CategoryTree>` JSX に `onDuplicateCategory={handleDuplicateCategory}` を追加する

---

## 7. 影響を受ける既存機能

| 機能 | 影響内容 | 対応方針 |
|-----|---------|---------|
| カテゴリー追加 | なし | 変更不要 |
| カテゴリーリネーム | なし | 変更不要 |
| カテゴリー削除 | なし | 変更不要 |
| リクエスト追加 | なし | 変更不要 |
| カテゴリー継承（`lib/inheritance.ts`） | 複製されたカテゴリーも通常カテゴリーと同様に継承計算対象となる | 変更不要（設計上問題なし） |
| IndexedDB マイグレーション | なし | 変更不要 |

---

## 8. 懸念事項・リスク

- **二重クリック防止**: 仕様 2.2「処理中はボタンを無効化」を実装するためには `ApiTester` 側でローディングフラグ（例: `isDuplicating: boolean`）を持ち、`onDuplicateCategory` の呼び出し前後でフラグを切り替え、`CategoryNode` へ渡す必要がある。本設計では Must Have のみ対象とし、Should Have のこの要件は実装者の判断に委ねる。実装する場合は `CategoryNodeProps` にさらに `isDuplicating?: boolean` を追加する。

- **大規模ツリーのパフォーマンス**: `cloneCategory` は同期再帰だが、IndexedDB への書き込みは単一トランザクションで行うため、100 リクエスト・10 階層程度なら 500ms 以内に完了する見込み（仕様 3 の非機能要件を満たす）。

- **`genId` の重複定義**: `ApiTester.tsx` と `storage.ts` の 2 箇所に同じ実装が存在する状態になる。将来的に ID 生成ロジックを変更する場合は両方を修正する必要がある点に注意する。
