import { HistoryItem, SavedRequest } from './types';

const HISTORY_KEY = 'api-tester-history';
const SAVED_KEY = 'api-tester-saved';

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

export function getSaved(): SavedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(SAVED_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveRequest(item: SavedRequest): void {
  const saved = getSaved();
  localStorage.setItem(SAVED_KEY, JSON.stringify([item, ...saved]));
}

export function deleteSaved(id: string): void {
  const saved = getSaved().filter(s => s.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
}
