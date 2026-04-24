import { HistoryItem, SavedRequest, Category } from './types';

const HISTORY_KEY = 'api-tester-history';
const SAVED_KEY = 'api-tester-saved';
const CATEGORIES_KEY = 'api-tester-categories';

// ── History ────────────────────────────────────────────────────────────────

export function getHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToHistory(item: HistoryItem): void {
  const history = getHistory();
  const updated = [item, ...history].slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

// ── Saved Requests ─────────────────────────────────────────────────────────

export function getSaved(): SavedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(SAVED_KEY);
    const items: SavedRequest[] = data ? JSON.parse(data) : [];
    // Migrate old items that lack categoryId
    return items.map(i => ({ ...i, categoryId: i.categoryId ?? null }));
  } catch {
    return [];
  }
}

export function saveRequest(item: SavedRequest): void {
  const saved = getSaved();
  localStorage.setItem(SAVED_KEY, JSON.stringify([item, ...saved]));
}

export function updateSavedRequest(id: string, updates: Partial<SavedRequest>): void {
  const saved = getSaved().map(s => s.id === id ? { ...s, ...updates } : s);
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
}

export function deleteSaved(id: string): void {
  const saved = getSaved().filter(s => s.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
}

// ── Categories ─────────────────────────────────────────────────────────────

export function getCategories(): Category[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(CATEGORIES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveCategory(item: Category): void {
  const cats = getCategories();
  const exists = cats.find(c => c.id === item.id);
  const updated = exists
    ? cats.map(c => c.id === item.id ? item : c)
    : [item, ...cats];
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(updated));
}

export function deleteCategory(id: string): void {
  // Also delete all descendant categories and their requests
  const cats = getCategories();

  const collectDescendants = (parentId: string): string[] => {
    const children = cats.filter(c => c.parentId === parentId).map(c => c.id);
    return [parentId, ...children.flatMap(collectDescendants)];
  };

  const toDelete = new Set(collectDescendants(id));
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats.filter(c => !toDelete.has(c.id))));

  // Remove requests that belonged to deleted categories
  const saved = getSaved().filter(s => !s.categoryId || !toDelete.has(s.categoryId));
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
}
