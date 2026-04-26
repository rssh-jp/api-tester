# SPEC-IndexedDB移行: localStorage → IndexedDB へのストレージ移行

> **ステータス**: 草稿  
> **作成日**: 2026-04-26  
> **最終更新**: 2026-04-26

---

## 1. 背景・目的

- **背景**: 現在の `lib/storage.ts` は全データを localStorage（上限 ~5MB）に保存している。大きな HTML/バイナリレスポンスを含む `HistoryItem` の保存時に `QuotaExceededError` が発生し、履歴が欠落するケースがある。現実装では `addToHistory` がクォータ超過時に古い件数を切り詰めることで回避しているが、根本的な解決にはなっていない。
- **目的**: ストレージバックエンドを IndexedDB に切り替え、実質的な容量制限を撤廃する。同時に、既存 localStorage データを自動マイグレーションすることで既存ユーザーのデータを失わない。
- **スコープ（含むもの）**:
  - `lib/storage.ts` の全関数を IndexedDB ベースの非同期 API に書き換え
  - `components/ApiTester.tsx` の呼び出し箇所を `await` 対応に更新
  - 初回 DB 初期化時に localStorage → IndexedDB へのワンタイムマイグレーション実装
- **スコープ（含まないもの）**:
  - IndexedDB 非対応環境（プライベートモード等）へのフォールバック
  - DB スキーマのバージョンアップ（v1 以降の migration 戦略）
  - サーバーサイド永続化・同期機能

---

## 2. 機能要件

### 2.1 必須要件（Must Have）

- [ ] `lib/storage.ts` の全公開関数を `async`/`Promise` 返却型に変更する
- [ ] DB 名 `api-tester-db`、バージョン `1` の IndexedDB を管理する
- [ ] object store を 3 つ作成する（`history`・`saved`・`categories`、いずれも `keyPath: 'id'`）
- [ ] `addToHistory` は最大 50 件を維持し、超過分は `timestamp` の古い順に削除する
- [ ] `deleteCategory` のカスケード削除（子孫カテゴリー・関連リクエスト）を維持する
- [ ] 初回 DB 初期化時に localStorage の `api-tester-history`・`api-tester-saved`・`api-tester-categories` を読み込んで IndexedDB へ移行し、その後 localStorage の該当キーを削除する
- [ ] `components/ApiTester.tsx` の storage 呼び出し箇所を `await` 対応に更新する

### 2.2 推奨要件（Should Have）

- [ ] DB 初期化処理（`openDB`）をシングルトンとして管理し、同時に複数の `open` リクエストが走らないようにする
- [ ] `getSaved` はロード時に旧フォーマット（`categoryId` フィールドなし）を `categoryId: null` へマイグレーションする（現挙動の維持）

### 2.3 将来対応（Nice to Have）

- [ ] IndexedDB スキーマのバージョンアップ戦略（`onupgradeneeded` の段階的マイグレーション）
- [ ] IndexedDB 非対応環境向け localStorage フォールバック

---

## 3. 非機能要件

- **パフォーマンス**: `getHistory()`・`getSaved()`・`getCategories()` のレスポンスは通常使用時（件数 ≤ 500）において 50ms 以内に完了すること
- **セキュリティ**: 移行処理で localStorage を読み込んだ後、確実に該当キーを削除すること（機密情報の二重保持を防止）
- **ブラウザ対応**: Chrome 最新版・Firefox 最新版・Safari 最新版（IndexedDB v2 対応済み）

---

## 4. UI/UX 設計

### 4.1 画面への影響

ストレージ層の変更のみであり、UI の見た目・操作フローに変更はない。

### 4.2 ユーザー操作フロー（マイグレーション）

1. ユーザーがページを初回ロード（または localStorage にデータが残った状態でロード）する
2. `openDB()` 内でマイグレーション関数が自動実行される
3. localStorage に保存データがあれば IndexedDB へ書き込む
4. localStorage の該当キーを削除する
5. 以降のロードではマイグレーション処理はスキップされる
6. ユーザーへの通知なし（透過的な移行）

### 4.3 エラーハンドリング

| エラー条件 | 挙動 |
|-----------|------|
| `indexedDB.open()` が失敗する | エラーをそのままスロー（呼び出し元でクラッシュ） |
| IndexedDB トランザクションが失敗する | エラーをそのままスロー |
| localStorage マイグレーション中に JSON パースエラー | 該当ストアのマイグレーションをスキップし、空の状態で継続する |

---

## 5. API 設計

### 5.1 内部 API ルート

変更なし（`/api/proxy` は影響を受けない）。

---

## 6. データモデル変更

### 6.1 IndexedDB スキーマ

```
DB名: api-tester-db
バージョン: 1

object store: history
  keyPath: "id"
  インデックス: timestamp (timestamp, { unique: false })  ← 古い順削除に使用

object store: saved
  keyPath: "id"

object store: categories
  keyPath: "id"
```

型定義（`lib/types.ts`）の変更はない。`HistoryItem`・`SavedRequest`・`Category` はそのまま使用する。

### 6.2 lib/storage.ts の公開 API 変更

```typescript
// ── 変更前（同期） ──────────────────────────────────────────────
export function getHistory(): HistoryItem[]
export function addToHistory(item: HistoryItem): void
export function clearHistory(): void

export function getSaved(): SavedRequest[]
export function saveRequest(item: SavedRequest): void
export function updateSavedRequest(id: string, updates: Partial<SavedRequest>): void
export function deleteSaved(id: string): void

export function getCategories(): Category[]
export function saveCategory(item: Category): void
export function deleteCategory(id: string): void

// ── 変更後（非同期） ────────────────────────────────────────────
export async function getHistory(): Promise<HistoryItem[]>
export async function addToHistory(item: HistoryItem): Promise<void>
export async function clearHistory(): Promise<void>

export async function getSaved(): Promise<SavedRequest[]>
export async function saveRequest(item: SavedRequest): Promise<void>
export async function updateSavedRequest(id: string, updates: Partial<SavedRequest>): Promise<void>
export async function deleteSaved(id: string): Promise<void>

export async function getCategories(): Promise<Category[]>
export async function saveCategory(item: Category): Promise<void>
export async function deleteCategory(id: string): Promise<void>
```

### 6.3 内部実装概要

```typescript
// DB 初期化（シングルトン）
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('api-tester-db', 1);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
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
    req.onsuccess = () => {
      migrateFromLocalStorage(req.result).then(() => resolve(req.result));
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// localStorage マイグレーション（ワンタイム）
async function migrateFromLocalStorage(db: IDBDatabase): Promise<void> {
  const keys = [
    { ls: 'api-tester-history',    store: 'history' },
    { ls: 'api-tester-saved',      store: 'saved' },
    { ls: 'api-tester-categories', store: 'categories' },
  ];
  for (const { ls, store } of keys) {
    const raw = localStorage.getItem(ls);
    if (!raw) continue;
    try {
      const items = JSON.parse(raw) as { id: string }[];
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for (const item of items) os.put(item);
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch {
      // パースエラー時はスキップ
    }
    localStorage.removeItem(ls);
  }
}

// addToHistory の 50 件上限維持
async function addToHistory(item: HistoryItem): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('history', 'readwrite');
  const store = tx.objectStore('history');
  store.put(item);
  // 全件取得して timestamp 昇順でソートし、51件目以降を削除
  const all = await getAllFromStore<HistoryItem>(db, 'history');
  if (all.length > 50) {
    const sorted = all.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = sorted.slice(0, all.length - 50);
    const delTx = db.transaction('history', 'readwrite');
    const delStore = delTx.objectStore('history');
    for (const old of toDelete) delStore.delete(old.id);
    await txComplete(delTx);
  }
}
```

### 6.4 マイグレーション方針

- マイグレーションは `openDB()` の `onsuccess` コールバック内でワンタイム実行する。
- localStorage にデータが存在する場合のみ移行処理を行い、存在しない場合はスキップする。
- 移行完了後は localStorage の該当キーを削除する（二重保持を防止）。
- マイグレーションの完了フラグは localStorage キーの有無で判定するため、専用のフラグキーは不要。

---

## 7. 実装対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `lib/storage.ts` | 全関数を IndexedDB ベースの async 実装に書き換え |
| `components/ApiTester.tsx` | `useEffect` と各 `useCallback` ハンドラで `await` を追加 |

### 7.1 ApiTester.tsx の変更箇所

```typescript
// ── 変更前 ──────────────────────────────────────────────────────
useEffect(() => {
  setCategories(getCategories());
  setRequests(getSaved());
  setHistory(getHistory());
}, []);

// ── 変更後 ──────────────────────────────────────────────────────
useEffect(() => {
  (async () => {
    setCategories(await getCategories());
    setRequests(await getSaved());
    setHistory(await getHistory());
  })();
}, []);
```

`handleSend`・`handleAddCategory`・`handleRenameCategory`・`handleDeleteCategory`・`handleCategoryChange`・`handleAddRequest`・`handleDeleteRequest`・`handleMoveRequest`・`handleSaveCurrentRequest`・`handleClearHistory` 内の storage 呼び出しも同様に `await` を付加し、直後の `setXxx(await getXxx())` パターンに更新する。

---

## 8. 受け入れ条件

- [ ] AC1: 数 MB の HTML レスポンスを含む履歴を 50 件保存しても `QuotaExceededError` が発生しないこと
- [ ] AC2: localStorage に旧データが存在する状態でページロードすると、IndexedDB に自動移行され localStorage の該当キーが削除されること
- [ ] AC3: 移行後、履歴・保存リクエスト・カテゴリーの CRUD が従来通り動作すること
- [ ] AC4: ページリロード後も全データが IndexedDB から正しく読み込まれること
- [ ] AC5: 履歴の上限（50 件）が維持され、超過分は古い順に削除されること
- [ ] AC6: `deleteCategory` でカテゴリーを削除すると、子孫カテゴリーおよびそれに属するリクエストも削除されること
- [ ] AC7: TypeScript の strict モードでコンパイルエラーが発生しないこと
- [ ] AC8: 既存機能（送信・保存・カテゴリー管理・継承・履歴）がリグレッションなく動作すること

---

## 9. 備考・制約

- **IndexedDB の SSR 対応**: Next.js の Server Components から `lib/storage.ts` を呼び出さないこと（`typeof window === 'undefined'` チェックは不要だが、インポート先を Client Component のみに限定する）。
- **並行リクエスト**: `openDB()` シングルトンにより、複数タブで同時にページを開いた場合でも DB 接続は共有される（IndexedDB 仕様による）。
- **依存する他機能**: カテゴリー継承（`lib/inheritance.ts`）はストレージ非依存のため変更不要。
- **既知の制約**: Safari のプライベートブラウズモードでは IndexedDB が使用不可となる場合がある。本仕様ではフォールバックは対象外とする。
