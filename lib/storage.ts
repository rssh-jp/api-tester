import { HistoryItem, SavedRequest, Category } from './types';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── DB 初期化 ──────────────────────────────────────────────────────────────

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

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ── マイグレーション ────────────────────────────────────────────────────────

const OLD_HISTORY_KEY = 'api-tester-history';
const OLD_SAVED_KEY = 'api-tester-saved';
const OLD_CATEGORIES_KEY = 'api-tester-categories';
const MIGRATED_KEY = 'api-tester-idb-migrated';

async function migrateFromLocalStorage(db: IDBDatabase): Promise<void> {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(MIGRATED_KEY)) return;

  const historyRaw = localStorage.getItem(OLD_HISTORY_KEY);
  const savedRaw = localStorage.getItem(OLD_SAVED_KEY);
  const catsRaw = localStorage.getItem(OLD_CATEGORIES_KEY);

  if (historyRaw) {
    try {
      const items: HistoryItem[] = JSON.parse(historyRaw);
      const tx = db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      for (const item of items) store.put(item);
      await txDone(tx);
    } catch { /* ignore malformed data */ }
  }
  if (savedRaw) {
    try {
      const items: SavedRequest[] = JSON.parse(savedRaw);
      const tx = db.transaction('saved', 'readwrite');
      const store = tx.objectStore('saved');
      for (const item of items) store.put(item);
      await txDone(tx);
    } catch { /* ignore malformed data */ }
  }
  if (catsRaw) {
    try {
      const items: Category[] = JSON.parse(catsRaw);
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      for (const item of items) store.put(item);
      await txDone(tx);
    } catch { /* ignore malformed data */ }
  }

  localStorage.removeItem(OLD_HISTORY_KEY);
  localStorage.removeItem(OLD_SAVED_KEY);
  localStorage.removeItem(OLD_CATEGORIES_KEY);
  localStorage.setItem(MIGRATED_KEY, '1');
}

let migrationDone = false;

async function getDB(): Promise<IDBDatabase> {
  const db = await openDB();
  if (!migrationDone) {
    await migrateFromLocalStorage(db);
    migrationDone = true;
  }
  return db;
}

// ── History ────────────────────────────────────────────────────────────────

export async function getHistory(): Promise<HistoryItem[]> {
  if (typeof window === 'undefined') return [];
  const db = await getDB();
  const tx = db.transaction('history', 'readonly');
  const all = await idbReq<HistoryItem[]>(tx.objectStore('history').getAll());
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

export async function addToHistory(item: HistoryItem): Promise<void> {
  const db = await getDB();
  const all = await getHistory();
  const toDelete = all.slice(49);
  const tx = db.transaction('history', 'readwrite');
  const store = tx.objectStore('history');
  for (const old of toDelete) store.delete(old.id);
  store.put(item);
  await txDone(tx);
}

export async function clearHistory(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('history', 'readwrite');
  tx.objectStore('history').clear();
  await txDone(tx);
}

// ── Saved Requests ─────────────────────────────────────────────────────────

export async function getSaved(): Promise<SavedRequest[]> {
  if (typeof window === 'undefined') return [];
  const db = await getDB();
  const tx = db.transaction('saved', 'readonly');
  const all = await idbReq<SavedRequest[]>(tx.objectStore('saved').getAll());
  return all
    .map(i => ({ ...i, categoryId: i.categoryId ?? null }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveRequest(item: SavedRequest): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('saved', 'readwrite');
  tx.objectStore('saved').put(item);
  await txDone(tx);
}

export async function updateSavedRequest(id: string, updates: Partial<SavedRequest>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('saved', 'readwrite');
  const store = tx.objectStore('saved');
  const existing = await idbReq<SavedRequest | undefined>(store.get(id));
  if (existing) store.put({ ...existing, ...updates });
  await txDone(tx);
}

export async function deleteSaved(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('saved', 'readwrite');
  tx.objectStore('saved').delete(id);
  await txDone(tx);
}

// ── Categories ─────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  if (typeof window === 'undefined') return [];
  const db = await getDB();
  const tx = db.transaction('categories', 'readonly');
  const all = await idbReq<Category[]>(tx.objectStore('categories').getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveCategory(item: Category): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('categories', 'readwrite');
  tx.objectStore('categories').put(item);
  await txDone(tx);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  const allCats = await getCategories();

  const collectDescendants = (parentId: string): string[] => {
    const children = allCats.filter(c => c.parentId === parentId).map(c => c.id);
    return [parentId, ...children.flatMap(collectDescendants)];
  };

  const toDelete = new Set(collectDescendants(id));

  const catTx = db.transaction('categories', 'readwrite');
  const catStore = catTx.objectStore('categories');
  for (const catId of toDelete) catStore.delete(catId);
  await txDone(catTx);

  const allSaved = await getSaved();
  const savedToDelete = allSaved.filter(s => s.categoryId && toDelete.has(s.categoryId));
  if (savedToDelete.length > 0) {
    const savedTx = db.transaction('saved', 'readwrite');
    const savedStore = savedTx.objectStore('saved');
    for (const s of savedToDelete) savedStore.delete(s.id);
    await txDone(savedTx);
  }
}

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

// ── Category expanded state (sync, localStorage) ───────────────────────────

const EXPANDED_KEY = 'api-tester-expanded';

export function getExpandedCategories(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveExpandedCategories(expanded: Set<string>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
}
