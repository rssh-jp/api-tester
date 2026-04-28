# DESIGN-ドラッグドロップ移動: サイドバーカテゴリーツリーのドラッグドロップ移動

> **ステータス**: 草稿  
> **作成日**: 2026-04-28  
> **最終更新**: 2026-04-28  
> **担当者**: —  
> **関連 Issue**: —

---

## 対応仕様書

- [`SPEC-ドラッグドロップ移動.md`](../specs/SPEC-ドラッグドロップ移動.md)

---

## 1. 概要

- **対応仕様書**: `docs/specs/SPEC-ドラッグドロップ移動.md`
- **設計方針**:
  - HTML5 Drag and Drop API は使用しない。ポインターイベント（`pointerdown` / `pointermove` / `pointerup`）で実装する。
  - ドラッグロジックはカスタムフック `useDragAndDrop`（`src/hooks/useDragAndDrop.ts`）に集約する。
  - `CategoryTree.tsx` を改修してフックを組み込む。新規コンポーネントは作成しない。
  - ストレージ操作は `lib/storage.ts` の既存関数（`updateCategory`, `updateSavedRequest`）を使用する。スキーマ変更・DB バージョンアップは不要。

---

## 2. コンポーネント構成

```
ApiTester.tsx
└── CategoryTree.tsx          ← useDragAndDrop フックを呼び出す
    ├── CategoryNode (内部コンポーネント)
    │   └── RequestRow (内部コンポーネント)
    ├── ルートドロップゾーン (インライン JSX, ドラッグ中のみ表示)
    └── ゴーストカプセル (createPortal → document.body)
```

### 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/lib/types.ts` | 変更 | `DragPhase`, `DragItem`, `DropTarget` 型を追加 |
| `src/hooks/useDragAndDrop.ts` | **新規** | ドラッグドロップカスタムフック |
| `src/components/CategoryTree.tsx` | 変更 | フック統合、`onMoveCategory` prop 追加、ルートゾーン・ゴースト追加 |
| `src/components/ApiTester.tsx` | 変更 | `handleMoveCategory` 追加、`onMoveCategory` を `CategoryTree` に渡す |

---

## 3. 型定義

### 追加する型（`src/lib/types.ts`）

```typescript
/** ドラッグ操作の進行フェーズ */
export type DragPhase = 'idle' | 'pressing' | 'dragging';

/** ドラッグ中のアイテム情報 */
export interface DragItem {
  type: 'category' | 'request';
  id: string;
  name: string;
  /** リクエストの場合のみ付与（ゴースト表示に使用） */
  method?: string;
}

/**
 * 現在ポインターが重なっているドロップ先。
 * null = ドロップ不可エリア
 */
export type DropTarget =
  | { type: 'category'; id: string }
  | { type: 'root' }
  | null;
```

---

## 4. カスタムフック設計（`src/hooks/useDragAndDrop.ts`）

### 4.1 インターフェース

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { Category, DragItem, DragPhase, DropTarget } from '@/lib/types';

interface UseDragAndDropOptions {
  categories: Category[];
  onMoveCategory: (categoryId: string, newParentId: string | null) => Promise<void>;
  onMoveRequest: (requestId: string, newCategoryId: string | null) => Promise<void>;
  /** ドラッグ中ホバーで自動展開するコールバック（Category ID を受け取り展開する） */
  onExpandCategory: (categoryId: string) => void;
}

interface UseDragAndDropResult {
  phase: DragPhase;
  dragItem: DragItem | null;
  dropTarget: DropTarget;
  /** ゴーストカプセルの表示座標（fixed position 用）*/
  ghostPos: { x: number; y: number };
  /** 各行の pointerdown イベントハンドラ */
  handlePointerDown: (e: React.PointerEvent, item: DragItem) => void;
  /** 指定 ID のアイテムがドラッグ中か（opacity-50 付与判定に使用）*/
  isDragSource: (id: string) => boolean;
  /** 指定ドロップターゲットが現在ハイライト中か */
  isActiveDropTarget: (target: DropTarget) => boolean;
  /** カテゴリーへのドロップが有効か（循環参照チェック済み）*/
  isValidTarget: (categoryId: string) => boolean;
}

export function useDragAndDrop(options: UseDragAndDropOptions): UseDragAndDropResult
```

### 4.2 状態遷移図

```
┌─────────────────────────────────────────────────────────┐
│  idle                                                    │
│    ↓ pointerdown on item                                │
│  pressing                                               │
│    ├──→ pointermove > 5px 閾値 → idle (cancel timer)    │
│    ├──→ pointerup (1秒未満) → idle (cancel timer)       │
│    └──→ 1秒タイマー発火 → dragging                      │
│                                                         │
│  dragging                                               │
│    ├──→ pointermove → ゴースト位置更新・ドロップ先判定  │
│    ├──→ pointerup (有効ターゲット) → move実行 → idle   │
│    ├──→ pointerup (無効ターゲット) → cancel → idle      │
│    └──→ Escape キー → cancel → idle                    │
└─────────────────────────────────────────────────────────┘
```

### 4.3 内部実装の詳細

#### 使用する React refs / state

```typescript
// state
const [phase, setPhase] = useState<DragPhase>('idle');
const [dragItem, setDragItem] = useState<DragItem | null>(null);
const [dropTarget, setDropTarget] = useState<DropTarget>(null);
const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });

// refs（レンダリング不要な内部状態）
const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const pressStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
const capturedElementRef = useRef<Element | null>(null);
const capturedPointerIdRef = useRef<number>(-1);
const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const prevHoverCatRef = useRef<string | null>(null);
```

#### `handlePointerDown`

```typescript
handlePointerDown(e: React.PointerEvent, item: DragItem) {
  e.preventDefault(); // テキスト選択防止
  pressStartPosRef.current = { x: e.clientX, y: e.clientY };
  capturedElementRef.current = e.currentTarget;
  capturedPointerIdRef.current = e.pointerId;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  setPhase('pressing');

  pressTimerRef.current = setTimeout(() => {
    // 1秒後にドラッグ開始
    setPhase('dragging');
    setDragItem(item);
    setGhostPos({ x: e.clientX, y: e.clientY });
  }, 1000);
}
```

#### `pointermove` ハンドラ（capturedElement に登録）

pressing フェーズでは移動距離チェック（> 5px でキャンセル）。
dragging フェーズでは：
1. `setGhostPos({ x: e.clientX, y: e.clientY })` でゴースト位置更新
2. `findDropTarget(e.clientX, e.clientY)` でドロップ先判定
3. 有効性チェック後 `setDropTarget()`
4. 自動展開タイマー管理

#### `pointerup` ハンドラ（capturedElement に登録）

```typescript
// pressing 中なら timer キャンセル → idle
// dragging 中なら:
//   dropTarget が有効なら move実行（onMoveCategory or onMoveRequest）
//   invalid / null なら cancel
// 共通: clearTimers(), setPhase('idle'), setDragItem(null), setDropTarget(null)
```

#### `findDropTarget(x, y): DropTarget`

```typescript
function findDropTarget(x: number, y: number): DropTarget {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  let node: Element | null = el;
  while (node) {
    const zoneType = node.getAttribute('data-drop-zone-type');
    if (zoneType === 'root') return { type: 'root' };
    if (zoneType === 'category') {
      const id = node.getAttribute('data-drop-zone-id');
      if (id) return { type: 'category', id };
    }
    node = node.parentElement;
  }
  return null;
}
```

ゴーストカプセルには `pointer-events: none` を設定するため `elementFromPoint` の干渉はない。

#### 自動展開ロジック

```typescript
// pointermove 内で dropTarget が変わった時:
if (target?.type === 'category' && target.id !== prevHoverCatRef.current) {
  clearAutoExpandTimer();
  prevHoverCatRef.current = target.id;
  autoExpandTimerRef.current = setTimeout(() => {
    options.onExpandCategory(target.id);
  }, 700);
} else if (target?.type !== 'category') {
  clearAutoExpandTimer();
  prevHoverCatRef.current = null;
}
```

#### `Escape` キー処理

`useEffect` で `phase === 'dragging'` の間のみ `window` に `keydown` リスナーを追加。  
`e.key === 'Escape'` でキャンセル処理を実行。

#### `isValidTarget(categoryId: string): boolean`

```typescript
function isValidTarget(categoryId: string): boolean {
  if (!dragItem) return false;
  if (dragItem.type === 'request') return true; // リクエストはどのカテゴリーへも移動可
  // カテゴリーの場合: 自分自身・子孫へのドロップは無効
  if (dragItem.id === categoryId) return false;
  return !isDescendant(dragItem.id, categoryId, categories);
}
```

#### `isDescendant(ancestorId, nodeId, categories): boolean`（フック内部ユーティリティ）

`nodeId` が `ancestorId` の子孫かどうかを確認する。`parentId` チェーンを辿り、`ancestorId` が出現すれば `true`。

```typescript
function isDescendant(
  ancestorId: string,
  nodeId: string,
  categories: Category[]
): boolean {
  let current = categories.find(c => c.id === nodeId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = categories.find(c => c.id === current!.parentId);
  }
  return false;
}
```

#### ドロップ実行

```typescript
async function executeDrop(target: DropTarget) {
  if (!dragItem) return;
  const newParent = target?.type === 'category' ? target.id : null;
  if (dragItem.type === 'category') {
    await options.onMoveCategory(dragItem.id, newParent);
  } else {
    await options.onMoveRequest(dragItem.id, newParent);
  }
  // ドロップ後、移動先カテゴリーを展開
  if (target?.type === 'category') {
    options.onExpandCategory(target.id);
  }
}
```

---

## 5. `CategoryTree.tsx` の変更

### 5.1 `CategoryTreeProps` への追加

```typescript
interface CategoryTreeProps {
  // 既存プロパティは変更なし
  // ...
  onMoveRequest: (requestId: string, newCategoryId: string | null) => void; // 既存（使用開始）
  onMoveCategory: (categoryId: string, newParentId: string | null) => void; // 新規追加
}
```

### 5.2 `CategoryTree` コンポーネント本体の変更

1. `_onMoveRequest` の `_` プレフィックスを除去し実際に利用する
2. `useDragAndDrop` フックを呼び出す

```typescript
const {
  phase, dragItem, dropTarget, ghostPos,
  handlePointerDown, isDragSource, isActiveDropTarget, isValidTarget,
} = useDragAndDrop({
  categories,
  onMoveCategory,
  onMoveRequest,
  onExpandCategory: useCallback((id: string) => {
    setExpanded(prev => {
      if (prev.has(id)) return prev;
      const next = new Set([...prev, id]);
      saveExpandedCategories(next);
      return next;
    });
  }, []),
});
```

3. ドラッグ中は `document.body` にカーソルスタイルを適用する

```typescript
useEffect(() => {
  if (phase === 'dragging') {
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  } else {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  return () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
}, [phase]);
```

4. ルートドロップゾーンをツリー下部に追加（ドラッグ中のみアクティブ表示）

```typescript
{/* ルートドロップゾーン */}
<div
  data-drop-zone-type="root"
  className={`mx-2 my-2 p-2 border rounded text-xs text-center transition-colors select-none ${
    phase === 'dragging'
      ? isActiveDropTarget({ type: 'root' })
        ? 'border-solid border-indigo-500 text-indigo-400 bg-indigo-500/5'
        : 'border-dashed border-indigo-500/30 text-slate-600'
      : 'border-dashed border-transparent text-transparent'
  }`}
>
  ルートへ移動
</div>
```

5. ゴーストカプセルを `createPortal` でレンダリング

```typescript
import { createPortal } from 'react-dom';

// JSX の return 内（条件付き）
{phase === 'dragging' && dragItem && typeof document !== 'undefined' &&
  createPortal(
    <div
      style={{
        position: 'fixed',
        left: ghostPos.x + 14,
        top: ghostPos.y + 14,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
      className="flex items-center gap-1.5 bg-slate-800 border border-indigo-500/40 rounded-lg px-2.5 py-1 shadow-xl shadow-black/40 backdrop-blur-sm"
    >
      {dragItem.type === 'category' ? (
        <Folder size={12} className="flex-shrink-0 text-amber-500/70" />
      ) : (
        <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[dragItem.method ?? 'GET'] ?? ''}`}>
          {dragItem.method}
        </span>
      )}
      <span className="text-xs text-slate-200 max-w-[8rem] truncate">{dragItem.name}</span>
    </div>,
    document.body,
  )
}
```

### 5.3 `CategoryNode` への変更

#### Props 追加

```typescript
interface CategoryNodeProps {
  // 既存のプロパティは変更なし
  // ...
  // 追加
  dragPhase: DragPhase;
  isDragSource: (id: string) => boolean;
  isActiveDropTarget: (target: DropTarget) => boolean;
  isValidTarget: (categoryId: string) => boolean;
  handlePointerDown: (e: React.PointerEvent, item: DragItem) => void;
}
```

#### 外側 wrapper div（ドロップゾーン）

`CategoryNode` の最外側 `<div>` に `data-drop-zone-type` と `data-drop-zone-id` を設定する。  
**重要**: 外側 wrapper に設定することで、子要素（リクエスト行・子カテゴリー）上でも `elementFromPoint` の DOM 走査でこのカテゴリーが検出される。

```tsx
<div
  data-drop-zone-type="category"
  data-drop-zone-id={category.id}
>
```

#### ヘッダー行のスタイル

```typescript
// ドラッグ中の視覚フィードバック
const isDragging = dragPhase === 'dragging';
const isSource = isDragSource(category.id);
const isTarget = isActiveDropTarget({ type: 'category', id: category.id });
const isValid = isValidTarget(category.id);

// ヘッダー行のクラス合成
className={`group flex items-center gap-1 py-1 pr-1 cursor-pointer transition-colors
  ${isSelected ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-800/40'}
  ${isSource ? 'opacity-50' : ''}
  ${isDragging && isTarget && isValid ? 'ring-1 ring-inset ring-indigo-500 bg-indigo-500/5' : ''}
  ${isDragging && isTarget && !isValid ? 'cursor-not-allowed' : ''}
`}
```

#### pointerdown ハンドラの設定（ヘッダー行に追加）

```typescript
onPointerDown={(e) => {
  if (isRenaming) return; // リネーム中はドラッグしない
  handlePointerDown(e, { type: 'category', id: category.id, name: category.name });
}}
```

### 5.4 `RequestRow` への変更

#### Props 追加

```typescript
interface RequestRowProps {
  // 既存のプロパティは変更なし
  // ...
  // 追加
  dragPhase: DragPhase;
  isDragSource: (id: string) => boolean;
  handlePointerDown: (e: React.PointerEvent, item: DragItem) => void;
}
```

#### 行のスタイル・ポインターイベント

```typescript
const isSource = isDragSource(request.id);

className={`group flex items-center gap-1.5 py-1 pr-1 cursor-pointer transition-colors
  ${isSelected ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-800/40'}
  ${isSource ? 'opacity-50' : ''}
`}

onPointerDown={(e) => {
  if (isRenaming) return;
  handlePointerDown(e, {
    type: 'request',
    id: request.id,
    name: request.name,
    method: request.request.method,
  });
}}
```

> **注意**: `RequestRow` 自体にはドロップゾーン用の `data-drop-zone-type` を付与しない。リクエスト上にホバーした場合は親 `CategoryNode` の `data-drop-zone-type="category"` が DOM 走査で拾われ、その親カテゴリーがドロップ先となる。

---

## 6. `ApiTester.tsx` の変更

### 6.1 `handleMoveCategory` の追加

既存の `handleMoveRequest` に倣って実装する。

```typescript
const handleMoveCategory = useCallback(async (categoryId: string, newParentId: string | null) => {
  await updateCategory(categoryId, { parentId: newParentId });
  setCategories(await getCategories());
}, []);
```

### 6.2 `CategoryTree` への props 追加

```tsx
<CategoryTree
  {/* 既存 props ... */}
  onMoveRequest={handleMoveRequest}
  onMoveCategory={handleMoveCategory}   {/* 新規追加 */}
/>
```

---

## 7. ストレージ変更

### 変更なし

既存の `updateCategory` と `updateSavedRequest` で対応可能。

```typescript
// カテゴリー移動
await updateCategory(categoryId, { parentId: newParentId });

// リクエスト移動
await updateSavedRequest(requestId, { categoryId: newCategoryId });
```

DB バージョン変更・マイグレーション処理は不要。

---

## 8. CSS / スタイリング設計

### ドラッグ状態別スタイル一覧

| 状態 | 対象要素 | Tailwind クラス |
|------|---------|----------------|
| ロングプレス待機中（pressing） | — | スタイル変更なし（フィードバックはタイマー完了後） |
| ドラッグ中・ドラッグ元 | `CategoryNode` ヘッダー行 / `RequestRow` | `opacity-50` |
| ドラッグ中・有効ドロップ先カテゴリー | `CategoryNode` 外側 wrapper | `ring-1 ring-inset ring-indigo-500 bg-indigo-500/5` |
| ドラッグ中・無効ドロップ先（循環参照等） | カーソル | `cursor-not-allowed`（`document.body.style.cursor` で上書き） |
| ルートドロップゾーン（非アクティブ） | root ゾーン div | `border-dashed border-indigo-500/30 text-slate-600` |
| ルートドロップゾーン（アクティブ） | root ゾーン div | `border-solid border-indigo-500 text-indigo-400 bg-indigo-500/5` |
| ゴーストカプセル | portal div | `bg-slate-800 border border-indigo-500/40 rounded-lg shadow-xl` |
| ドラッグ中カーソル（body） | `document.body` | `cursor: grabbing` (inline style) |

### `globals.css` への追加

不要。既存 Tailwind クラスのみで対応可能。

---

## 9. data 属性設計

DOM 要素に付与する `data-*` 属性の一覧。

| 属性名 | 値 | 付与対象 | 用途 |
|-------|---|---------|------|
| `data-drop-zone-type` | `"category"` | `CategoryNode` 外側 wrapper div | `elementFromPoint` でのドロップ先判定 |
| `data-drop-zone-type` | `"root"` | ルートドロップゾーン div | ルートへのドロップ判定 |
| `data-drop-zone-id` | カテゴリー ID | `CategoryNode` 外側 wrapper div | ドロップ先カテゴリーの特定 |

---

## 10. 実装手順

以下の順序で実装する。

### Step 1: 型定義の追加（`src/lib/types.ts`）

- [ ] `DragPhase`, `DragItem`, `DropTarget` を追加する

### Step 2: カスタムフックの実装（`src/hooks/useDragAndDrop.ts`）

- [ ] `useDragAndDrop` フック本体を実装する（状態管理・イベントハンドラ・`isDescendant`）
- [ ] `pointerdown` → pressing → 1秒後 dragging の状態遷移を実装する
- [ ] `pointermove` でのゴースト位置更新・ドロップ先判定を実装する
- [ ] `pointerup` でのドロップ実行・キャンセル処理を実装する
- [ ] `Escape` キーキャンセルを実装する
- [ ] 自動展開タイマーを実装する
- [ ] `isValidTarget`（循環参照チェック含む）を実装する

### Step 3: `CategoryTree.tsx` の変更

- [ ] `CategoryTreeProps` に `onMoveCategory` を追加する（`_onMoveRequest` の `_` も除去）
- [ ] `useDragAndDrop` フックを呼び出す
- [ ] `CategoryNode` / `RequestRow` に drag 関連 props を追加・伝播する
- [ ] `CategoryNode` 外側 wrapper に `data-drop-zone-type` / `data-drop-zone-id` を付与する
- [ ] ヘッダー行・リクエスト行に `onPointerDown` と視覚フィードバッククラスを追加する
- [ ] ルートドロップゾーンを追加する
- [ ] ゴーストカプセルを `createPortal` で追加する
- [ ] `document.body.style.cursor` / `userSelect` の制御を `useEffect` で追加する

### Step 4: `ApiTester.tsx` の変更

- [ ] `handleMoveCategory` コールバックを追加する
- [ ] `CategoryTree` に `onMoveCategory={handleMoveCategory}` を渡す

### Step 5: 動作確認

- [ ] 受け入れ条件 AC1〜AC13 をすべて手動で確認する

---

## 11. 影響を受ける既存機能

| 機能名 | 影響内容 | 対応方針 |
|-------|---------|---------|
| インライン名前変更（ダブルクリック） | `pointerdown` がリネームと競合する可能性 | `isRenaming` フラグが true の場合は `handlePointerDown` をスキップ |
| クリックによる選択 | 長押し中の `pointerup`（1秒未満）はクリックとして処理される | pressing フェーズの `pointerup` では timer をキャンセルして idle に戻るだけで、選択処理はそのまま流れる（preventDefault はしない） |
| カテゴリー展開/折り畳み（シェブロンクリック） | `pointerdown` がシェブロンに当たる場合 | シェブロンの `onClick` は `e.stopPropagation()` 済みのため影響なし。`onPointerDown` はヘッダー行全体に設定するが、シェブロンでは `handlePointerDown` 内で `e.target` をチェックして（または `span.onPointerDown` で `e.stopPropagation()`）無視する |
| カテゴリー削除・複製ボタン | ホバーで表示されるアクションボタン | ドラッグ中は `group-hover:opacity-100` が働かなくなる（ポインターキャプチャ中は hover state が更新されない）が、機能上の問題なし |

---

## 12. 懸念事項・リスク

### ポインターキャプチャとシェブロンの競合

- `CategoryNode` ヘッダー行全体に `onPointerDown` を設定すると、シェブロン（展開トグル）上で長押しした場合もドラッグが開始する。
- **対策**: シェブロンの `<span>` に `onPointerDown={(e) => e.stopPropagation()}` を追加して、ドラッグ開始を抑制する。

### `elementFromPoint` でゴースト要素が検出される

- ゴーストカプセルは `pointer-events: none` を付与するため問題なし。

### SSR（Server-Side Rendering）での `document` 参照

- `useDragAndDrop` と `createPortal` は `'use client'` コンポーネント内でのみ使用される。
- `createPortal` の呼び出しは `typeof document !== 'undefined'` でガードする。

### 長いツリーでのスクロール非対応

- 仕様書のスコープ外（将来対応の Nice to Have）。スクロールが必要な場合はユーザーが手動でスクロール後にドロップする。

### モバイルタッチ対応非スコープ

- ポインターイベントは Touch Events と統合されているため、タッチデバイスでも動作する可能性があるが、本仕様のスコープ外（Nice to Have）。

---

## 13. テスト計画

### ユニットテスト

`useDragAndDrop` のテストは DOM 操作が必要なため Vitest のブラウザモードまたは `@testing-library/react` で実施する。現行の `lib/__tests__/` ではなく、将来的なフックテストの追加として扱う（今回のスコープ外）。

`isDescendant` 関数（フック内部ユーティリティ）はピュア関数のためユニットテスト可能。

### 手動確認チェックリスト

受け入れ条件 AC1〜AC13 に準拠する。

| チェック | 内容 |
|---------|------|
| AC1 | リクエスト行を 1 秒長押し → 別カテゴリーへドロップ → 移動 OK |
| AC2 | カテゴリー行を 1 秒長押し → 別カテゴリーへドロップ → 配下ごと移動 OK |
| AC3 | カテゴリーをルートゾーンへドロップ → `parentId: null` |
| AC4 | リクエストをルートゾーンへドロップ → `categoryId: null`（未分類に表示） |
| AC5 | カテゴリーを直接の子へドロップ → 拒否 |
| AC6 | カテゴリーを 2 段以上深い子孫へドロップ → 拒否 |
| AC7 | ドラッグ中に Escape → キャンセル・元の位置維持 |
| AC8 | 無効な場所でリリース → 元の位置維持 |
| AC9 | ドラッグ中はドラッグ元行が半透明 |
| AC10 | ドラッグ中は有効ドロップ先カテゴリーがハイライト |
| AC11 | 1 秒未満のクリックは選択・リネームが正常動作 |
| AC12 | リロード後も移動結果が IndexedDB に保持 |
| AC13 | 既存の名前変更・削除・複製・リクエスト送信が正常動作 |
