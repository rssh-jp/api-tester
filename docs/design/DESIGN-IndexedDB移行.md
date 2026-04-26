# DESIGN-IndexedDB移行: localStorage → IndexedDB へのストレージ移行

## 1. 概要

- **対応仕様書**: `docs/specs/SPEC-IndexedDB移行.md`
- **設計方針**: `lib/storage.ts` を全面的に IndexedDB ベースの非同期実装に書き換え、`components/ApiTester.tsx` の呼び出し側を `await` 対応に更新する。型定義・継承ロジック・その他コンポーネントは変更しない。

---

## 2. コンポーネント設計

### 2.1 新規作成コンポーネント

なし。

### 2.2 変更するコンポーネント

#### `ApiTester` (`components/ApiTester.tsx`)

- **変更内容**: storage 関数呼び出し箇所を全て `await` 対応に変更する
- **変更理由**: `lib/storage.ts` の全関数が `Promise` を返す非同期 API に変わるため
- **影響範囲**: `app/page.tsx` からマウントされているが、インターフェース（props）に変更はない

---

## 3. 型定義変更

### 3.1 変更する型

なし。`lib/types.ts` の `HistoryItem`・`SavedRequest`・`Category` はそのまま使用する。

### 3.2 新規追加する型

なし。

---

## 4. ストレージ設計（IndexedDB）

### 4.1 DB スキーマ

| 項目 | 値 |
|------|----|
| DB 名 | `api-tester-db` |
| バージョン | `1` |

| object store | keyPath | インデックス | 説明 |
|--------------|---------|-------------|------|
| `history` | `id` | `timestamp`（non-unique） | 履歴アイテム（最大 50 件） |
| `saved` | `id` | なし | 保存済みリクエスト |
| `categories` | `id` | なし | カテゴリー |

### 4.2 内部ユーティリティ関数

```typescript
// DB 初期化（シングルトン）
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('api-tester-db', 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('history')) {
        const histStore = db.createObjectStore('history', { keyPath: 'id' });
        histStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('saved')) {
        db.createObjectStore('saved', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
  return dbPromise;
}

// IDBRequest → Promise 変換ヘルパー
function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// IDBTransaction 完了待ちヘルパー
function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 全件取得ヘルパー
async function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  const tx = db.transaction(storeName, 'readonly');
  return idbReq<T[]>(tx.objectStore(storeName).getAll());
}
```

### 4.3 マイグレーション処理

マイグレーションのトリガーは **localStorage に該当キーが存在するかどうか** で判定する。専用フラグキーは使用しない。

```typescript
async function migrateFromLocalStorage(db: IDBDatabase): Promise<void> {
  const stores = [
    { ls: 'api-tester-history',    idb: 'history' },
    { ls: 'api-tester-saved',      idb: 'saved' },
    { ls: 'api-tester-categories', idb: 'categories' },
  ] as const;

  for (const { ls, idb } of stores) {
    const raw = localStorage.getItem(ls);
    if (!raw) continue;
    try {
      const items = JSON.parse(raw) as { id: string }[];
      const tx = db.transaction(idb, 'readwrite');
      const os = tx.objectStore(idb);
      for (const item of items) os.put(item);
      await txComplete(tx);
    } catch {
      // JSON パースエラー等は該当ストアをスキップして継続
    }
    localStorage.removeItem(ls);
  }
}
```

`getDB()` をすべての公開関数から呼ぶことで、初回のみマイグレーションを実行する：

```typescript
async function getDB(): Promise<IDBDatabase> {
  const db = await openDB();
  await migrateFromLocalStorage(db);
  return db;
}
```

> **注意**: `openDB()` のシングルトンキャッシュにより、`migrateFromLocalStorage` が複数回呼ばれても localStorage キーがなければ即時リターンするため二重実行は発生しない。

### 4.4 公開 API の新しいシグネチャ一覧

```typescript
// ── History ──────────────────────────────────────────────────────
export async function getHistory(): Promise<HistoryItem[]>
export async function addToHistory(item: HistoryItem): Promise<void>
export async function clearHistory(): Promise<void>

// ── Saved Requests ────────────────────────────────────────────────
export async function getSaved(): Promise<SavedRequest[]>
export async function saveRequest(item: SavedRequest): Promise<void>
export async function updateSavedRequest(id: string, updates: Partial<SavedRequest>): Promise<void>
export async function deleteSaved(id: string): Promise<void>

// ── Categories ────────────────────────────────────────────────────
export async function getCategories(): Promise<Category[]>
export async function saveCategory(item: Category): Promise<void>
export async function deleteCategory(id: string): Promise<void>
```

### 4.5 主要関数の実装方針

#### `getHistory()`

```typescript
export async function getHistory(): Promise<HistoryItem[]> {
  const db = await getDB();
  const all = await getAllFromStore<HistoryItem>(db, 'history');
  return all.sort((a, b) => b.timestamp - a.timestamp); // 降順
}
```

#### `addToHistory(item)`

put 後に全件取得し、50 件を超えた場合は `timestamp` 昇順でソートした先頭（最古）から削除する。

```typescript
export async function addToHistory(item: HistoryItem): Promise<void> {
  const db = await getDB();
  const putTx = db.transaction('history', 'readwrite');
  putTx.objectStore('history').put(item);
  await txComplete(putTx);

  const all = await getAllFromStore<HistoryItem>(db, 'history');
  if (all.length > 50) {
    const sorted = all.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = sorted.slice(0, all.length - 50);
    const delTx = db.transaction('history', 'readwrite');
    const store = delTx.objectStore('history');
    for (const old of toDelete) store.delete(old.id);
    await txComplete(delTx);
  }
}
```

#### `getSaved()`

旧フォーマット（`categoryId` フィールドなし）のマイグレーションを維持する。

```typescript
export async function getSaved(): Promise<SavedRequest[]> {
  const db = await getDB();
  const items = await getAllFromStore<SavedRequest>(db, 'saved');
  return items.map(i => ({ ...i, categoryId: i.categoryId ?? null }));
}
```

#### `saveCategory(item)`

upsert（既存 ID なら上書き、なければ追加）。IndexedDB の `put` は upsert のため追加ロジック不要。

```typescript
export async function saveCategory(item: Category): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('categories', 'readwrite');
  tx.objectStore('categories').put(item);
  await txComplete(tx);
}
```

#### `deleteCategory(id)`

カスケード削除（子孫カテゴリー＋関連リクエスト）を維持する。全件取得してメモリ上で子孫を収集してから削除する。

```typescript
export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  const cats = await getAllFromStore<Category>(db, 'categories');

  const collectDescendants = (parentId: string): string[] => {
    const children = cats.filter(c => c.parentId === parentId).map(c => c.id);
    return [parentId, ...children.flatMap(collectDescendants)];
  };
  const toDelete = new Set(collectDescendants(id));

  const catTx = db.transaction('categories', 'readwrite');
  const catStore = catTx.objectStore('categories');
  for (const catId of toDelete) catStore.delete(catId);
  await txComplete(catTx);

  const saved = await getAllFromStore<SavedRequest>(db, 'saved');
  const savedToDelete = saved.filter(s => s.categoryId && toDelete.has(s.categoryId));
  if (savedToDelete.length > 0) {
    const savedTx = db.transaction('saved', 'readwrite');
    const savedStore = savedTx.objectStore('saved');
    for (const s of savedToDelete) savedStore.delete(s.id);
    await txComplete(savedTx);
  }
}
```

---

## 5. カスタム Hooks 設計

変更なし。新規 Hooks の追加は不要。

---

## 6. API ルート設計

変更なし。`/api/proxy` は影響を受けない。

---

## 7. ApiTester.tsx の変更パターン

### 7.1 mount useEffect の async 化

```typescript
// 変更前
useEffect(() => {
  setCategories(getCategories());
  setRequests(getSaved());
  setHistory(getHistory());
}, []);

// 変更後
useEffect(() => {
  (async () => {
    setCategories(await getCategories());
    setRequests(await getSaved());
    setHistory(await getHistory());
  })();
}, []);
```

### 7.2 handleSend 内の storage 呼び出し

`handleSend` はすでに `async` 関数のため、`await` を追加するだけでよい。

```typescript
// 変更前
addToHistory(historyItem);
setHistory(getHistory());
if (selectedRequest) {
  updateSavedRequest(selectedRequest.id, { request: { ...editingRequest } });
  setRequests(getSaved());
}

// 変更後
await addToHistory(historyItem);
setHistory(await getHistory());
if (selectedRequest) {
  await updateSavedRequest(selectedRequest.id, { request: { ...editingRequest } });
  setRequests(await getSaved());
}
```

### 7.3 useCallback ハンドラの async 化

以下のハンドラはコールバック本体を `async` に変更し、内部の storage 呼び出しに `await` を付加する。

| ハンドラ | 変更内容 |
|---------|---------|
| `handleSaveCurrentRequest` | `async` 化、`updateSavedRequest` と `getSaved` を `await` |
| `handleAddCategory` | `async` 化、`saveCategory` と `getCategories` を `await` |
| `handleRenameCategory` | `async` 化、`getCategories`（内部取得）・`saveCategory`・`getCategories`（再読み込み）を `await` |
| `handleDeleteCategory` | `async` 化、`deleteCategory`・`getCategories`・`getSaved` を `await` |
| `handleCategoryChange` | `async` 化、`saveCategory` と `getCategories` を `await` |
| `handleAddRequest` | `async` 化、`saveRequest` と `getSaved` を `await` |
| `handleDeleteRequest` | `async` 化、`deleteSaved` と `getSaved` を `await` |
| `handleMoveRequest` | `async` 化、`updateSavedRequest` と `getSaved` を `await` |
| `handleClearHistory` | `async` 化、`clearHistory` を `await` |

#### 変更パターン例（handleAddCategory）

```typescript
// 変更前
const handleAddCategory = useCallback((parentId: string | null) => {
  const name = window.prompt('Category name:', 'New Category');
  if (!name?.trim()) return;
  const cat: Category = { ... };
  saveCategory(cat);
  setCategories(getCategories());
}, []);

// 変更後
const handleAddCategory = useCallback(async (parentId: string | null) => {
  const name = window.prompt('Category name:', 'New Category');
  if (!name?.trim()) return;
  const cat: Category = { ... };
  await saveCategory(cat);
  setCategories(await getCategories());
}, []);
```

> **注意**: `handleRenameCategory` 内の `getCategories().find(...)` は `await getCategories()` に変更する。

---

## 8. 実装手順

依存関係を考慮した実装順序：

1. **`lib/storage.ts` の全面書き換え**
   - 内部ユーティリティ（`openDB`・`idbReq`・`txComplete`・`getAllFromStore`・`migrateFromLocalStorage`・`getDB`）を実装
   - 公開関数（`getHistory`・`addToHistory`・`clearHistory`・`getSaved`・`saveRequest`・`updateSavedRequest`・`deleteSaved`・`getCategories`・`saveCategory`・`deleteCategory`）を async 実装に書き換え
2. **`components/ApiTester.tsx` の修正**
   - mount `useEffect` を async IIFE パターンに変更
   - `handleSend` に `await` を追加
   - 各 `useCallback` ハンドラを `async` 化し `await` を追加

---

## 9. 変更不要ファイル

| ファイル | 理由 |
|---------|------|
| `lib/types.ts` | 型定義に変更なし |
| `lib/inheritance.ts` | ストレージ非依存のため影響なし |
| `components/CategoryTree.tsx` | storage を直接呼び出していない |
| `components/CategoryEditor.tsx` | storage を直接呼び出していない |
| `components/RequestPanel.tsx` | storage を直接呼び出していない |
| `components/ResponsePanel.tsx` | storage を直接呼び出していない |
| `components/UrlBar.tsx` | storage を直接呼び出していない |
| `components/KeyValueTable.tsx` | storage を直接呼び出していない |
| `components/Sidebar.tsx` | storage を直接呼び出していない |
| `app/api/proxy/route.ts` | ストレージ層と無関係 |
| `app/page.tsx` | `ApiTester` の props に変更なし |
| `app/layout.tsx` | 変更なし |

---

## 10. 影響を受ける既存機能

| 機能名 | 影響内容 | 対応方針 |
|-------|---------|---------|
| 履歴保存・表示 | `addToHistory`・`getHistory` が非同期化 | `handleSend` と mount useEffect を async 対応 |
| 保存リクエスト CRUD | `saveRequest` 等が非同期化 | 各ハンドラを async 化 |
| カテゴリー管理 | `saveCategory`・`deleteCategory` 等が非同期化 | 各ハンドラを async 化 |
| カテゴリー継承 | `computeEffectiveValues` は storage 非依存 | 変更不要 |

---

## 11. 懸念事項・リスク

- **SSR 対応**: Next.js の Server Component から `lib/storage.ts` をインポートしないこと。IndexedDB は `window` 依存のため、`typeof window === 'undefined'` チェックは不要だが、インポート先を Client Component のみに限定する。現状の `ApiTester.tsx`（`'use client'`）のみが利用しており、問題なし。
- **Safari プライベートブラウズ**: IndexedDB が使用不可となる場合がある。本設計ではフォールバックは対象外とし、エラーをそのままスローする。
- **マイグレーション中の例外**: JSON パースエラーが発生した場合は該当ストアのマイグレーションをスキップして継続する（仕様 4.3 エラーハンドリング準拠）。
- **複数タブ**: `openDB()` シングルトンにより同一タブ内での重複接続は防止される。複数タブ間の同期はブラウザの IndexedDB 仕様に委ねる（本仕様のスコープ外）。
