import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { HistoryItem, SavedRequest, Category } from '../types';

function makeHistoryItem(id: string, timestamp = 0): HistoryItem {
  return {
    id,
    timestamp,
    request: { method: 'GET', url: 'http://x', params: [], headers: [], body: '', contentType: '' },
    response: { status: 200, statusText: 'OK', headers: {}, body: '', responseTime: 0, size: 0 },
  };
}

function makeSavedRequest(id: string, categoryId: string | null = null): SavedRequest {
  return {
    id,
    name: `req-${id}`,
    categoryId,
    request: { method: 'GET', url: 'http://x', params: [], headers: [], body: '', contentType: '' },
    createdAt: Date.now(),
  };
}

function makeCategory(id: string, parentId: string | null = null): Category {
  return {
    id,
    name: `cat-${id}`,
    parentId,
    defaultHeaders: [],
    defaultParams: [],
    variables: [],
    createdAt: Date.now(),
  };
}

describe('storage', () => {
  let storage: typeof import('../storage');

  beforeEach(async () => {
    vi.resetModules();
    (globalThis as unknown as Record<string, unknown>).indexedDB = new IDBFactory();
    localStorage.clear();
    storage = await import('../storage');
  });

  // ── getExpandedCategories / saveExpandedCategories ──

  describe('getExpandedCategories', () => {
    it('returns empty set when nothing stored', () => {
      const result = storage.getExpandedCategories();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('returns stored set', () => {
      localStorage.setItem('api-tester-expanded', JSON.stringify(['cat1', 'cat2']));
      const result = storage.getExpandedCategories();
      expect(result.has('cat1')).toBe(true);
      expect(result.has('cat2')).toBe(true);
    });

    it('returns empty set on malformed JSON', () => {
      localStorage.setItem('api-tester-expanded', 'invalid{{{');
      expect(storage.getExpandedCategories().size).toBe(0);
    });
  });

  describe('saveExpandedCategories', () => {
    it('persists and retrieves', () => {
      const expanded = new Set(['a', 'b', 'c']);
      storage.saveExpandedCategories(expanded);
      const result = storage.getExpandedCategories();
      expect(result.has('a')).toBe(true);
      expect(result.has('b')).toBe(true);
      expect(result.has('c')).toBe(true);
    });
  });

  // ── History ──

  describe('getHistory', () => {
    it('returns [] when DB is empty', async () => {
      expect(await storage.getHistory()).toEqual([]);
    });

    it('returns items sorted by timestamp descending', async () => {
      await storage.addToHistory(makeHistoryItem('h1', 10));
      await storage.addToHistory(makeHistoryItem('h2', 20));
      await storage.addToHistory(makeHistoryItem('h3', 5));
      const items = await storage.getHistory();
      expect(items[0].id).toBe('h2');
      expect(items[1].id).toBe('h1');
      expect(items[2].id).toBe('h3');
    });
  });

  describe('addToHistory', () => {
    it('adds item', async () => {
      await storage.addToHistory(makeHistoryItem('h1', 100));
      const items = await storage.getHistory();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('h1');
    });

    it('trims to 50 items', async () => {
      for (let i = 0; i < 51; i++) {
        await storage.addToHistory(makeHistoryItem(`h${i}`, i));
      }
      const items = await storage.getHistory();
      expect(items).toHaveLength(50);
      expect(items.find(i => i.id === 'h0')).toBeUndefined();
    });
  });

  describe('clearHistory', () => {
    it('removes all history items', async () => {
      await storage.addToHistory(makeHistoryItem('h1', 1));
      await storage.addToHistory(makeHistoryItem('h2', 2));
      await storage.clearHistory();
      expect(await storage.getHistory()).toHaveLength(0);
    });
  });

  // ── SavedRequests ──

  describe('getSaved', () => {
    it('returns [] when empty', async () => {
      expect(await storage.getSaved()).toEqual([]);
    });

    it('normalizes missing categoryId to null', async () => {
      const req = makeSavedRequest('r1') as unknown as Record<string, unknown>;
      delete req.categoryId;
      await storage.saveRequest(req as unknown as SavedRequest);
      const saved = await storage.getSaved();
      expect(saved[0].categoryId).toBeNull();
    });
  });

  describe('saveRequest', () => {
    it('persists a request', async () => {
      const req = makeSavedRequest('r1');
      await storage.saveRequest(req);
      const saved = await storage.getSaved();
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('r1');
    });
  });

  describe('updateSavedRequest', () => {
    it('updates existing request', async () => {
      await storage.saveRequest(makeSavedRequest('r1'));
      await storage.updateSavedRequest('r1', { name: 'updated-name' });
      const saved = await storage.getSaved();
      expect(saved[0].name).toBe('updated-name');
    });

    it('does nothing for unknown id', async () => {
      await storage.saveRequest(makeSavedRequest('r1'));
      await storage.updateSavedRequest('nonexistent', { name: 'noop' });
      const saved = await storage.getSaved();
      expect(saved[0].name).toBe('req-r1');
    });
  });

  describe('deleteSaved', () => {
    it('removes request', async () => {
      await storage.saveRequest(makeSavedRequest('r1'));
      await storage.deleteSaved('r1');
      expect(await storage.getSaved()).toHaveLength(0);
    });
  });

  // ── Categories ──

  describe('getCategories', () => {
    it('returns [] when empty', async () => {
      expect(await storage.getCategories()).toEqual([]);
    });

    it('normalizes missing variables to []', async () => {
      const cat = makeCategory('c1') as unknown as Record<string, unknown>;
      delete cat.variables;
      await storage.saveCategory(cat as unknown as Category);
      const cats = await storage.getCategories();
      expect(cats[0].variables).toEqual([]);
    });
  });

  describe('saveCategory', () => {
    it('persists a category', async () => {
      await storage.saveCategory(makeCategory('c1'));
      const cats = await storage.getCategories();
      expect(cats).toHaveLength(1);
      expect(cats[0].id).toBe('c1');
    });
  });

  describe('updateCategory', () => {
    it('updates the name of an existing category', async () => {
      await storage.saveCategory({ ...makeCategory('c1'), name: 'original' });
      await storage.updateCategory('c1', { name: 'renamed' });
      const cats = await storage.getCategories();
      expect(cats[0].name).toBe('renamed');
    });

    it('preserves other fields when updating name', async () => {
      const cat = { ...makeCategory('c1'), name: 'original', description: 'desc' };
      await storage.saveCategory(cat);
      await storage.updateCategory('c1', { name: 'new-name' });
      const cats = await storage.getCategories();
      expect(cats[0].description).toBe('desc');
      expect(cats[0].id).toBe('c1');
    });

    it('does nothing for unknown id', async () => {
      await storage.saveCategory({ ...makeCategory('c1'), name: 'original' });
      await storage.updateCategory('nonexistent', { name: 'noop' });
      const cats = await storage.getCategories();
      expect(cats[0].name).toBe('original');
    });
  });

  describe('deleteCategory', () => {
    it('deletes single category', async () => {
      await storage.saveCategory(makeCategory('c1'));
      await storage.deleteCategory('c1');
      expect(await storage.getCategories()).toHaveLength(0);
    });

    it('cascades to sub-categories and their requests', async () => {
      await storage.saveCategory(makeCategory('parent'));
      await storage.saveCategory(makeCategory('child', 'parent'));
      await storage.saveRequest(makeSavedRequest('r1', 'child'));
      await storage.deleteCategory('parent');
      expect(await storage.getCategories()).toHaveLength(0);
      expect(await storage.getSaved()).toHaveLength(0);
    });
  });

  describe('duplicateCategory', () => {
    it('throws for unknown id', async () => {
      await expect(storage.duplicateCategory('nonexistent')).rejects.toThrow();
    });

    it('clones category with (copy) suffix', async () => {
      await storage.saveCategory({ ...makeCategory('c1'), name: 'MyCategory' });
      const newId = await storage.duplicateCategory('c1');
      const cats = await storage.getCategories();
      const copy = cats.find(c => c.id === newId);
      expect(copy).toBeDefined();
      expect(copy!.name).toBe('MyCategory (copy)');
    });

    it('clones nested sub-categories and requests', async () => {
      await storage.saveCategory({ ...makeCategory('parent'), name: 'Parent' });
      await storage.saveCategory({ ...makeCategory('child', 'parent'), name: 'Child' });
      await storage.saveRequest(makeSavedRequest('r1', 'parent'));
      await storage.saveRequest(makeSavedRequest('r2', 'child'));

      const newId = await storage.duplicateCategory('parent');

      const cats = await storage.getCategories();
      expect(cats).toHaveLength(4); // parent, child, new-parent, new-child

      const newParent = cats.find(c => c.id === newId);
      expect(newParent!.name).toBe('Parent (copy)');

      const newChild = cats.find(c => c.parentId === newId);
      expect(newChild).toBeDefined();
      expect(newChild!.name).toBe('Child');

      const saved = await storage.getSaved();
      expect(saved).toHaveLength(4); // r1, r2, cloned copies

      const reqsForNewParent = saved.filter(r => r.categoryId === newId);
      expect(reqsForNewParent).toHaveLength(1);

      const reqsForNewChild = saved.filter(r => r.categoryId === newChild!.id);
      expect(reqsForNewChild).toHaveLength(1);
    });
  });

  // ── Migration ──

  describe('migrateFromLocalStorage', () => {
    it('migrates history from localStorage', async () => {
      const histItem = makeHistoryItem('h1', 100);
      localStorage.setItem('api-tester-history', JSON.stringify([histItem]));
      const items = await storage.getHistory();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('h1');
      expect(localStorage.getItem('api-tester-history')).toBeNull();
      expect(localStorage.getItem('api-tester-idb-migrated')).toBe('1');
    });

    it('migrates saved requests', async () => {
      const req = makeSavedRequest('r1');
      localStorage.setItem('api-tester-saved', JSON.stringify([req]));
      const saved = await storage.getSaved();
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('r1');
      expect(localStorage.getItem('api-tester-saved')).toBeNull();
    });

    it('migrates categories', async () => {
      const cat = makeCategory('c1');
      localStorage.setItem('api-tester-categories', JSON.stringify([cat]));
      const cats = await storage.getCategories();
      expect(cats).toHaveLength(1);
      expect(cats[0].id).toBe('c1');
      expect(localStorage.getItem('api-tester-categories')).toBeNull();
    });

    it('skips if already migrated', async () => {
      const histItem = makeHistoryItem('h1', 100);
      localStorage.setItem('api-tester-history', JSON.stringify([histItem]));
      localStorage.setItem('api-tester-idb-migrated', '1');
      const items = await storage.getHistory();
      expect(items).toHaveLength(0);
      expect(localStorage.getItem('api-tester-history')).not.toBeNull();
    });

    it('ignores malformed JSON in localStorage', async () => {
      localStorage.setItem('api-tester-history', 'invalid{{{');
      localStorage.setItem('api-tester-saved', 'invalid{{{');
      localStorage.setItem('api-tester-categories', 'invalid{{{');
      const items = await storage.getHistory();
      expect(items).toHaveLength(0);
      expect(localStorage.getItem('api-tester-idb-migrated')).toBe('1');
      expect(localStorage.getItem('api-tester-history')).toBeNull();
    });
  });

  // ── exportData / importData / validateExportData ──

  describe('exportData', () => {
    it('returns categories and requests from DB', async () => {
      const cat = makeCategory('c1');
      const req = makeSavedRequest('r1', 'c1');
      await storage.saveCategory(cat);
      await storage.saveRequest(req);

      const data = await storage.exportData();

      expect(data.version).toBe(1);
      expect(typeof data.exportedAt).toBe('number');
      expect(data.categories).toHaveLength(1);
      expect(data.categories[0].id).toBe('c1');
      expect(data.requests).toHaveLength(1);
      expect(data.requests[0].id).toBe('r1');
    });

    it('returns empty arrays when DB is empty', async () => {
      const data = await storage.exportData();
      expect(data.categories).toEqual([]);
      expect(data.requests).toEqual([]);
    });
  });

  describe('importData', () => {
    it('overwrites existing categories and requests', async () => {
      await storage.saveCategory(makeCategory('old-cat'));
      await storage.saveRequest(makeSavedRequest('old-req'));

      const importPayload = storage.validateExportData({
        version: 1,
        exportedAt: Date.now(),
        categories: [makeCategory('new-cat')],
        requests: [makeSavedRequest('new-req', 'new-cat')],
      });
      await storage.importData(importPayload);

      const cats = await storage.getCategories();
      const reqs = await storage.getSaved();
      expect(cats).toHaveLength(1);
      expect(cats[0].id).toBe('new-cat');
      expect(reqs).toHaveLength(1);
      expect(reqs[0].id).toBe('new-req');
    });

    it('can import empty data (clears existing)', async () => {
      await storage.saveCategory(makeCategory('c1'));
      await storage.saveRequest(makeSavedRequest('r1'));

      const importPayload = storage.validateExportData({
        version: 1,
        exportedAt: Date.now(),
        categories: [],
        requests: [],
      });
      await storage.importData(importPayload);

      expect(await storage.getCategories()).toHaveLength(0);
      expect(await storage.getSaved()).toHaveLength(0);
    });

    it('reads back imported data correctly', async () => {
      const cat = makeCategory('c-import');
      const req = makeSavedRequest('r-import', 'c-import');
      const importPayload = storage.validateExportData({
        version: 1,
        exportedAt: 1000,
        categories: [cat],
        requests: [req],
      });
      await storage.importData(importPayload);

      const cats = await storage.getCategories();
      const reqs = await storage.getSaved();
      expect(cats[0].name).toBe('cat-c-import');
      expect(reqs[0].name).toBe('req-r-import');
      expect(reqs[0].categoryId).toBe('c-import');
    });
  });

  describe('validateExportData', () => {
    it('passes a valid ExportData object', () => {
      const raw = {
        version: 1,
        exportedAt: 1000,
        categories: [makeCategory('c1')],
        requests: [makeSavedRequest('r1')],
      };
      const result = storage.validateExportData(raw);
      expect(result.version).toBe(1);
      expect(result.categories).toHaveLength(1);
      expect(result.requests).toHaveLength(1);
    });

    it('throws "version" error when version !== 1', () => {
      expect(() =>
        storage.validateExportData({ version: 2, exportedAt: 0, categories: [], requests: [] })
      ).toThrow('version');
    });

    it('throws when categories is not an array', () => {
      expect(() =>
        storage.validateExportData({ version: 1, exportedAt: 0, categories: 'not-array', requests: [] })
      ).toThrow();
    });

    it('throws when requests is not an array', () => {
      expect(() =>
        storage.validateExportData({ version: 1, exportedAt: 0, categories: [], requests: null })
      ).toThrow();
    });

    it('throws when passed null', () => {
      expect(() => storage.validateExportData(null)).toThrow();
    });

    it('throws when passed undefined', () => {
      expect(() => storage.validateExportData(undefined)).toThrow();
    });

    it('strips unknown fields from the output', () => {
      const raw = {
        version: 1,
        exportedAt: 0,
        categories: [{ ...makeCategory('c1'), __proto__: { injected: true }, evilField: 'evil' }],
        requests: [{ ...makeSavedRequest('r1'), evilField: 'evil' }],
      };
      const result = storage.validateExportData(raw);
      expect((result.categories[0] as unknown as Record<string, unknown>)['evilField']).toBeUndefined();
      expect((result.requests[0] as unknown as Record<string, unknown>)['evilField']).toBeUndefined();
    });

    it('falls back to "GET" for invalid HttpMethod in request', () => {
      const raw = {
        version: 1,
        exportedAt: 0,
        categories: [],
        requests: [
          {
            ...makeSavedRequest('r1'),
            request: { ...makeSavedRequest('r1').request, method: 'INVALID' },
          },
        ],
      };
      const result = storage.validateExportData(raw);
      expect(result.requests[0].request.method).toBe('GET');
    });

    it('falls back to Date.now() when exportedAt is missing', () => {
      const before = Date.now();
      const result = storage.validateExportData({
        version: 1,
        categories: [],
        requests: [],
      });
      expect(result.exportedAt).toBeGreaterThanOrEqual(before);
    });

    it('throws when categories contains null element', () => {
      expect(() =>
        storage.validateExportData({ version: 1, exportedAt: 0, categories: [null], requests: [] })
      ).toThrow();
    });
  });
});
