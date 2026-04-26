'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Sun, Moon, Clock, Zap, Plus } from 'lucide-react';
import {
  HttpMethod,
  KeyValuePair,
  RequestState,
  ResponseState,
  HistoryItem,
  SavedRequest,
  Category,
  Selection,
} from '@/lib/types';
import {
  getHistory,
  addToHistory,
  clearHistory,
  getSaved,
  saveRequest,
  updateSavedRequest,
  deleteSaved,
  getCategories,
  saveCategory,
  deleteCategory,
  duplicateCategory,
} from '@/lib/storage';
import { computeEffectiveValues } from '@/lib/inheritance';
import UrlBar from './UrlBar';
import RequestPanel from './RequestPanel';
import ResponsePanel from './ResponsePanel';
import CategoryTree from './CategoryTree';
import CategoryEditor from './CategoryEditor';

// ─── helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function buildUrlWithParams(baseUrl: string, params: KeyValuePair[]): string {
  const enabledParams = params.filter(p => p.key && p.enabled);
  if (enabledParams.length === 0) return baseUrl;
  try {
    const urlStr = baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`;
    const url = new URL(urlStr);
    enabledParams.forEach(p => url.searchParams.set(p.key, p.value));
    return baseUrl.includes('://') ? url.toString() : url.toString().replace('https://', '');
  } catch {
    const qs = enabledParams
      .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    return baseUrl.includes('?') ? `${baseUrl}&${qs}` : `${baseUrl}?${qs}`;
  }
}

function parseParamsFromUrl(url: string): KeyValuePair[] {
  try {
    const urlStr = url.includes('://') ? url : `https://${url}`;
    const parsed = new URL(urlStr);
    const params: KeyValuePair[] = [];
    parsed.searchParams.forEach((value, key) => {
      params.push({ id: genId(), key, value, enabled: true });
    });
    return params;
  } catch {
    return [];
  }
}

const defaultRequest: RequestState = {
  method: 'GET',
  url: '',
  params: [],
  headers: [],
  body: '',
  contentType: 'application/json',
};

// ─── HistoryList ──────────────────────────────────────────────────────────────

const METHOD_BG: Record<string, string> = {
  GET:     'bg-emerald-500/15 text-emerald-400',
  POST:    'bg-amber-500/15 text-amber-400',
  PUT:     'bg-blue-500/15 text-blue-400',
  DELETE:  'bg-red-500/15 text-red-400',
  PATCH:   'bg-orange-500/15 text-orange-400',
  HEAD:    'bg-purple-500/15 text-purple-400',
  OPTIONS: 'bg-pink-500/15 text-pink-400',
};

function HistoryList({
  history,
  onLoad,
  onClear,
}: {
  history: HistoryItem[];
  onLoad: (req: RequestState) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col h-full bg-[#0d1117]">
        <div className="px-3 py-2 border-b border-slate-800/80 flex items-center">
          <span className="text-xs text-slate-600 flex-1">No history yet</span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-center px-4">
          <Clock size={28} className="text-slate-800 mb-3" />
          <p className="text-xs text-slate-600">Sent requests will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="px-3 py-2 border-b border-slate-800/80 flex items-center flex-shrink-0">
        <span className="text-xs text-slate-500 flex-1">{history.length} item(s)</span>
        <button
          onClick={onClear}
          className="text-xs text-slate-600 hover:text-red-400 transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {history.map(item => (
          <button
            key={item.id}
            onClick={() => onLoad(item.request)}
            className="w-full text-left px-3 py-2.5 hover:bg-slate-800/40 border-b border-slate-800/30 transition-colors group"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  METHOD_BG[item.request.method] ?? 'text-slate-400'
                }`}
              >
                {item.request.method}
              </span>
              {item.response.status > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    item.response.status < 300
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : item.response.status < 400
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-red-500/15 text-red-400'
                  }`}
                >
                  {item.response.status}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono truncate">{item.request.url || '(no url)'}</p>
            <p className="text-[10px] text-slate-700 mt-0.5">
              {new Date(item.timestamp).toLocaleTimeString()}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── WelcomeState ─────────────────────────────────────────────────────────────

function WelcomeState({ onNewRequest }: { onNewRequest: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#080c14] text-center px-8 select-none">
      <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
        <Zap size={36} className="text-indigo-400" />
      </div>
      <h2 className="text-xl font-semibold text-slate-200 mb-2">API Tester</h2>
      <p className="text-sm text-slate-500 mb-8 max-w-xs leading-relaxed">
        Organize your requests into categories, set default headers and parameters, and test any API.
      </p>
      <div className="flex flex-col gap-2 text-left w-full max-w-xs">
        {[
          ['1', 'Create a category in the left panel'],
          ['2', 'Add a request inside it'],
          ['3', 'Hit Send and inspect the response'],
        ].map(([n, text]) => (
          <div key={n} className="flex items-center gap-3 text-sm text-slate-500">
            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-bold flex-shrink-0">{n}</span>
            {text}
          </div>
        ))}
      </div>
      <button
        onClick={onNewRequest}
        className="mt-8 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/20"
      >
        <Plus size={15} /> New Request
      </button>
    </div>
  );
}

// ─── ApiTester ────────────────────────────────────────────────────────────────

export default function ApiTester() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [requests, setRequests] = useState<SavedRequest[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [editingRequest, setEditingRequest] = useState<RequestState>(defaultRequest);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<'collections' | 'history'>('collections');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // ── mount ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setCategories(await getCategories());
      setRequests(await getSaved());
      setHistory(await getHistory());
    })();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // ── reset response when selection changes ──────────────────────────────────

  useEffect(() => {
    setResponse(null);
  }, [selection]);

  // ── sync editingRequest when selection or requests change ──────────────────

  useEffect(() => {
    if (selection?.type === 'request') {
      const found = requests.find(r => r.id === selection.id);
      if (found) setEditingRequest({ ...found.request });
    }
  }, [selection, requests]);

  // ── derived ────────────────────────────────────────────────────────────────

  const selectedRequest =
    selection?.type === 'request' ? requests.find(r => r.id === selection.id) ?? null : null;

  const selectedCategory =
    selection?.type === 'category'
      ? categories.find(c => c.id === selection.id) ?? null
      : null;

  // ── URL / params sync ──────────────────────────────────────────────────────

  const handleUrlChange = useCallback((url: string) => {
    const params = parseParamsFromUrl(url);
    setEditingRequest(prev => ({
      ...prev,
      url,
      params: params.length > 0 ? params : prev.params,
    }));
  }, []);

  const handleParamsChange = useCallback((params: KeyValuePair[]) => {
    setEditingRequest(prev => {
      let baseUrl = prev.url;
      try {
        const urlStr = prev.url.includes('://') ? prev.url : `https://${prev.url}`;
        const parsed = new URL(urlStr);
        parsed.search = '';
        baseUrl = prev.url.includes('://') ? parsed.toString() : parsed.toString().replace('https://', '');
        if (!prev.url.endsWith('/') && baseUrl.endsWith('/')) {
          baseUrl = baseUrl.slice(0, -1);
        }
      } catch {
        baseUrl = prev.url.split('?')[0];
      }
      return { ...prev, params, url: buildUrlWithParams(baseUrl, params) };
    });
  }, []);

  // ── send ───────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!editingRequest.url.trim()) return;
    setLoading(true);
    setResponse(null);

    try {
      const categoryId = selectedRequest?.categoryId ?? null;
      const { headers: effectiveHeaders, params: effectiveParams } = computeEffectiveValues(
        editingRequest.headers,
        editingRequest.params,
        categoryId,
        categories,
      );

      // Build final URL with effective params
      let baseUrl = editingRequest.url;
      try {
        const urlStr = editingRequest.url.includes('://') ? editingRequest.url : `https://${editingRequest.url}`;
        const parsed = new URL(urlStr);
        parsed.search = '';
        baseUrl = editingRequest.url.includes('://') ? parsed.toString() : parsed.toString().replace('https://', '');
        if (!editingRequest.url.endsWith('/') && baseUrl.endsWith('/')) {
          baseUrl = baseUrl.slice(0, -1);
        }
      } catch {
        baseUrl = editingRequest.url.split('?')[0];
      }
      const finalUrl = buildUrlWithParams(baseUrl, effectiveParams);

      const enabledHeaders: Record<string, string> = {};
      effectiveHeaders.forEach(h => { enabledHeaders[h.key] = h.value; });
      if (editingRequest.contentType && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(editingRequest.method)) {
        enabledHeaders['Content-Type'] = editingRequest.contentType;
      }

      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: editingRequest.method,
          url: finalUrl,
          headers: enabledHeaders,
          body: editingRequest.body || undefined,
        }),
      });

      const data = await res.json();

      const responseState: ResponseState = {
        status: data.status || res.status,
        statusText: data.statusText || '',
        headers: data.headers || {},
        body: data.body ?? '',
        responseTime: data.responseTime || 0,
        size: data.size || 0,
        error: data.error,
        contentType: data.contentType,
        redirected: data.redirected,
        finalUrl: data.finalUrl,
        isBinary: data.isBinary,
      };

      setResponse(responseState);

      const historyItem: HistoryItem = {
        id: genId(),
        request: { ...editingRequest },
        response: responseState,
        timestamp: Date.now(),
      };
      await addToHistory(historyItem);
      setHistory(await getHistory());

      // Auto-save back
      if (selectedRequest) {
        await updateSavedRequest(selectedRequest.id, { request: { ...editingRequest } });
        setRequests(await getSaved());
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send request';
      setResponse({
        status: 0,
        statusText: 'Error',
        headers: {},
        body: '',
        responseTime: 0,
        size: 0,
        error: message,
      });
    } finally {
      setLoading(false);
    }
  }, [editingRequest, selectedRequest, categories]);

  // ── save current request ───────────────────────────────────────────────────

  const handleSaveCurrentRequest = useCallback(async () => {
    if (!selectedRequest) return;
    await updateSavedRequest(selectedRequest.id, { request: { ...editingRequest } });
    setRequests(await getSaved());
  }, [selectedRequest, editingRequest]);

  // ── category handlers ──────────────────────────────────────────────────────

  const handleAddCategory = useCallback(async (parentId: string | null) => {
    const name = window.prompt('Category name:', 'New Category');
    if (!name?.trim()) return;
    const cat: Category = {
      id: genId(),
      name: name.trim(),
      parentId,
      defaultHeaders: [],
      defaultParams: [],
      createdAt: Date.now(),
    };
    await saveCategory(cat);
    setCategories(await getCategories());
  }, []);

  const handleRenameCategory = useCallback(async (id: string, newName: string) => {
    const cats = await getCategories();
    const cat = cats.find(c => c.id === id);
    if (!cat) return;
    await saveCategory({ ...cat, name: newName });
    setCategories(await getCategories());
  }, []);

  const handleDeleteCategory = useCallback(async (id: string) => {
    await deleteCategory(id);
    setCategories(await getCategories());
    setRequests(await getSaved());
    if (selection?.type === 'category' && selection.id === id) {
      setSelection(null);
    }
  }, [selection]);

  const handleDuplicateCategory = useCallback(async (id: string) => {
    try {
      const newId = await duplicateCategory(id);
      const [updatedCats, updatedSaved] = await Promise.all([getCategories(), getSaved()]);
      setCategories(updatedCats);
      setRequests(updatedSaved);
      setSelection({ type: 'category', id: newId });
    } catch (err) {
      console.error('Failed to duplicate category:', err);
    }
  }, []);

  const handleCategoryChange = useCallback(async (updated: Category) => {
    await saveCategory(updated);
    setCategories(await getCategories());
  }, []);

  // ── request handlers ───────────────────────────────────────────────────────

  const handleAddRequest = useCallback(async (categoryId: string | null) => {
    const item: SavedRequest = {
      id: genId(),
      name: 'New Request',
      categoryId,
      request: { ...defaultRequest },
      createdAt: Date.now(),
    };
    await saveRequest(item);
    setRequests(await getSaved());
    setSelection({ type: 'request', id: item.id });
  }, []);

  const handleDeleteRequest = useCallback(async (id: string) => {
    await deleteSaved(id);
    setRequests(await getSaved());
    if (selection?.type === 'request' && selection.id === id) {
      setSelection(null);
    }
  }, [selection]);

  const handleMoveRequest = useCallback(async (requestId: string, newCategoryId: string | null) => {
    await updateSavedRequest(requestId, { categoryId: newCategoryId });
    setRequests(await getSaved());
  }, []);

  // ── history handlers ───────────────────────────────────────────────────────

  const handleLoadFromHistory = useCallback((req: RequestState) => {
    setEditingRequest({ ...req });
    setResponse(null);
    setSelection(null);
  }, []);

  const handleClearHistory = useCallback(async () => {
    await clearHistory();
    setHistory([]);
  }, []);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#080c14] text-slate-100 flex flex-col h-screen">
      {/* Header */}
      <header className="bg-[#0d1117]/80 backdrop-blur border-b border-slate-800/80 px-5 py-3 flex items-center justify-between flex-shrink-0">
        <span className="text-indigo-400 font-bold text-base tracking-tight flex items-center gap-2">
          <Zap size={16} className="text-indigo-400" /> API Tester
        </span>
        <button
          onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left pane */}
        {sidebarOpen && (
          <div className="w-72 flex-shrink-0 flex flex-col border-r border-slate-800/80">
            {/* Tab switcher */}
            <div className="flex gap-1 p-1.5 bg-[#080c14] border-b border-slate-800">
              {(['collections', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setLeftTab(tab)}
                  className={`flex-1 py-1.5 text-xs font-medium capitalize rounded-md transition-colors ${
                    leftTab === tab
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden">
              {leftTab === 'collections' && (
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
              )}
              {leftTab === 'history' && (
                <HistoryList
                  history={history}
                  onLoad={handleLoadFromHistory}
                  onClear={handleClearHistory}
                />
              )}
            </div>
          </div>
        )}

        {/* Sidebar toggle strip */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="w-5 bg-[#0d1117] border-x border-slate-800/80 text-slate-700 hover:text-slate-400 hover:bg-slate-800/40 flex items-center justify-center flex-shrink-0"
        >
          {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Right pane */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {selection === null && <WelcomeState onNewRequest={() => handleAddRequest(null)} />}

          {selection?.type === 'category' && selectedCategory && (
            <CategoryEditor
              category={selectedCategory}
              categories={categories}
              requests={requests}
              onChange={handleCategoryChange}
              onSelectRequest={id => setSelection({ type: 'request', id })}
            />
          )}

          {selection?.type === 'request' && (
            <>
              {/* Request name editor */}
              <div className="px-5 pt-4 pb-3 border-b border-slate-800/60 bg-[#0d1117] flex-shrink-0">
                <input
                  type="text"
                  value={selectedRequest?.name ?? ''}
                  onChange={async e => {
                    if (!selectedRequest) return;
                    await updateSavedRequest(selectedRequest.id, { name: e.target.value });
                    setRequests(await getSaved());
                  }}
                  placeholder="Request name"
                  className="w-full bg-transparent text-lg font-semibold text-slate-100 placeholder-slate-600 border-b border-transparent hover:border-slate-700 focus:border-indigo-500/80 focus:outline-none px-0 py-0.5 transition-colors"
                />
              </div>

              {/* URL bar + save */}
              <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800 bg-[#0d1117] flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <UrlBar
                    method={editingRequest.method}
                    url={editingRequest.url}
                    loading={loading}
                    onMethodChange={m => setEditingRequest(prev => ({ ...prev, method: m }))}
                    onUrlChange={handleUrlChange}
                    onSend={handleSend}
                  />
                </div>
                <button
                  onClick={handleSaveCurrentRequest}
                  className="flex-shrink-0 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/60"
                >
                  Save
                </button>
              </div>

              {/* Request panel */}
              <div className="h-[45%] border-b border-slate-800 overflow-hidden flex-shrink-0">
                <RequestPanel
                  method={editingRequest.method}
                  params={editingRequest.params}
                  headers={editingRequest.headers}
                  body={editingRequest.body}
                  contentType={editingRequest.contentType}
                  onParamsChange={handleParamsChange}
                  onHeadersChange={h => setEditingRequest(prev => ({ ...prev, headers: h }))}
                  onBodyChange={b => setEditingRequest(prev => ({ ...prev, body: b }))}
                  onContentTypeChange={ct => setEditingRequest(prev => ({ ...prev, contentType: ct }))}
                />
              </div>

              {/* Response panel */}
              <div className="flex-1 overflow-hidden">
                <ResponsePanel response={response} loading={loading} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
