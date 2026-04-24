'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Sun, Moon, Clock, Zap } from 'lucide-react';
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

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  DELETE: 'text-red-400',
  PATCH: 'text-orange-400',
  HEAD: 'text-purple-400',
  OPTIONS: 'text-pink-400',
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
      <div className="flex flex-col h-full bg-gray-900">
        <div className="flex items-center justify-end px-3 py-2 border-b border-gray-700">
          <span className="text-xs text-gray-500 flex-1">No history yet</span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-center px-4">
          <Clock size={28} className="text-gray-700 mb-3" />
          <p className="text-xs text-gray-500">Sent requests will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex items-center px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <span className="text-xs text-gray-400 flex-1">{history.length} item(s)</span>
        <button
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {history.map(item => (
          <button
            key={item.id}
            onClick={() => onLoad(item.request)}
            className="w-full text-left flex items-start gap-2 px-3 py-2 hover:bg-gray-800 border-b border-gray-800 transition-colors group"
          >
            <span
              className={`flex-shrink-0 text-xs font-semibold pt-0.5 ${
                METHOD_COLORS[item.request.method] ?? 'text-gray-400'
              }`}
            >
              {item.request.method}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-300 truncate">{item.request.url || '(no url)'}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {new Date(item.timestamp).toLocaleTimeString()}
                {item.response.status > 0 && (
                  <span
                    className={`ml-2 font-medium ${
                      item.response.status < 300
                        ? 'text-green-500'
                        : item.response.status < 400
                        ? 'text-yellow-500'
                        : 'text-red-500'
                    }`}
                  >
                    {item.response.status}
                  </span>
                )}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── WelcomeState ─────────────────────────────────────────────────────────────

function WelcomeState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
      <Zap size={48} className="text-blue-500 mb-4 opacity-80" />
      <h2 className="text-xl font-semibold text-gray-200 mb-2">Welcome to API Tester</h2>
      <p className="text-sm text-gray-500 max-w-sm mb-6">
        Select a request or category from the left panel to get started, or create a new one.
      </p>
      <div className="text-xs text-gray-600 space-y-1">
        <p>💡 Use <span className="text-gray-400">New Category</span> to group related requests</p>
        <p>💡 Categories can inherit default headers &amp; params</p>
        <p>💡 Click <span className="text-gray-400">New Request</span> to create your first request</p>
      </div>
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
    setCategories(getCategories());
    setRequests(getSaved());
    setHistory(getHistory());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // ── sync editingRequest when selection changes to a request ────────────────

  useEffect(() => {
    if (selection?.type === 'request') {
      const found = requests.find(r => r.id === selection.id);
      if (found) {
        setEditingRequest({ ...found.request });
        setResponse(null);
      }
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
        body: data.body || '',
        responseTime: data.responseTime || 0,
        size: data.size || 0,
        error: data.error,
      };

      setResponse(responseState);

      const historyItem: HistoryItem = {
        id: genId(),
        request: { ...editingRequest },
        response: responseState,
        timestamp: Date.now(),
      };
      addToHistory(historyItem);
      setHistory(getHistory());

      // Auto-save back
      if (selectedRequest) {
        updateSavedRequest(selectedRequest.id, { request: { ...editingRequest } });
        setRequests(getSaved());
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

  const handleSaveCurrentRequest = useCallback(() => {
    if (!selectedRequest) return;
    updateSavedRequest(selectedRequest.id, { request: { ...editingRequest } });
    setRequests(getSaved());
  }, [selectedRequest, editingRequest]);

  // ── category handlers ──────────────────────────────────────────────────────

  const handleAddCategory = useCallback((parentId: string | null) => {
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
    saveCategory(cat);
    setCategories(getCategories());
  }, []);

  const handleRenameCategory = useCallback((id: string, newName: string) => {
    const cat = getCategories().find(c => c.id === id);
    if (!cat) return;
    saveCategory({ ...cat, name: newName });
    setCategories(getCategories());
  }, []);

  const handleDeleteCategory = useCallback((id: string) => {
    deleteCategory(id);
    setCategories(getCategories());
    setRequests(getSaved());
    if (selection?.type === 'category' && selection.id === id) {
      setSelection(null);
    }
  }, [selection]);

  const handleCategoryChange = useCallback((updated: Category) => {
    saveCategory(updated);
    setCategories(getCategories());
  }, []);

  // ── request handlers ───────────────────────────────────────────────────────

  const handleAddRequest = useCallback((categoryId: string | null) => {
    const item: SavedRequest = {
      id: genId(),
      name: 'New Request',
      categoryId,
      request: { ...defaultRequest },
      createdAt: Date.now(),
    };
    saveRequest(item);
    setRequests(getSaved());
    setSelection({ type: 'request', id: item.id });
  }, []);

  const handleDeleteRequest = useCallback((id: string) => {
    deleteSaved(id);
    setRequests(getSaved());
    if (selection?.type === 'request' && selection.id === id) {
      setSelection(null);
    }
  }, [selection]);

  const handleMoveRequest = useCallback((requestId: string, newCategoryId: string | null) => {
    updateSavedRequest(requestId, { categoryId: newCategoryId });
    setRequests(getSaved());
  }, []);

  // ── history handlers ───────────────────────────────────────────────────────

  const handleLoadFromHistory = useCallback((req: RequestState) => {
    setEditingRequest({ ...req });
    setResponse(null);
    setSelection(null);
  }, []);

  const handleClearHistory = useCallback(() => {
    clearHistory();
    setHistory([]);
  }, []);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={`flex flex-col h-screen ${
        theme === 'dark' ? 'bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900'
      }`}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <span className="text-blue-400 font-bold text-lg">⚡ API Tester</span>
        <button
          onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          className="p-2 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left pane */}
        {sidebarOpen && (
          <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-700">
            {/* Tab switcher */}
            <div className="flex border-b border-gray-700 flex-shrink-0">
              {(['collections', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setLeftTab(tab)}
                  className={`flex-1 py-2 text-xs font-medium capitalize transition-colors border-b-2 ${
                    leftTab === tab
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
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
          className="flex-shrink-0 w-5 flex items-center justify-center bg-gray-800 hover:bg-gray-700 border-r border-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Right pane */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {selection === null && <WelcomeState />}

          {selection?.type === 'category' && selectedCategory && (
            <CategoryEditor
              category={selectedCategory}
              categories={categories}
              onChange={handleCategoryChange}
            />
          )}

          {selection?.type === 'request' && (
            <>
              {/* URL bar + save */}
              <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-700 bg-gray-900 flex-shrink-0">
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
                  className="flex-shrink-0 px-3 py-2 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
                >
                  Save
                </button>
              </div>

              {/* Request panel */}
              <div className="h-[45%] border-b border-gray-700 overflow-hidden flex-shrink-0">
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
