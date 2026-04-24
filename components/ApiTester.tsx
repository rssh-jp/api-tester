'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';
import { HttpMethod, KeyValuePair, RequestState, ResponseState, HistoryItem, SavedRequest } from '@/lib/types';
import { getHistory, addToHistory, getSaved, saveRequest, deleteSaved } from '@/lib/storage';
import UrlBar from './UrlBar';
import RequestPanel from './RequestPanel';
import ResponsePanel from './ResponsePanel';
import Sidebar from './Sidebar';

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
    const qs = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
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

export default function ApiTester() {
  const [request, setRequest] = useState<RequestState>(defaultRequest);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [saved, setSaved] = useState<SavedRequest[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    setHistory(getHistory());
    setSaved(getSaved());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const updateRequest = useCallback((updates: Partial<RequestState>) => {
    setRequest(prev => ({ ...prev, ...updates }));
  }, []);

  const handleUrlChange = useCallback((url: string) => {
    const params = parseParamsFromUrl(url);
    setRequest(prev => ({
      ...prev,
      url,
      params: params.length > 0 ? params : prev.params,
    }));
  }, []);

  const handleParamsChange = useCallback((params: KeyValuePair[]) => {
    setRequest(prev => {
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
      const newUrl = buildUrlWithParams(baseUrl, params);
      return { ...prev, params, url: newUrl };
    });
  }, []);

  const handleSend = useCallback(async () => {
    if (!request.url.trim()) return;
    setLoading(true);
    setResponse(null);

    try {
      const enabledHeaders: Record<string, string> = {};
      request.headers
        .filter(h => h.key && h.enabled)
        .forEach(h => { enabledHeaders[h.key] = h.value; });

      if (request.contentType && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        enabledHeaders['Content-Type'] = request.contentType;
      }

      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: request.method,
          url: request.url,
          headers: enabledHeaders,
          body: request.body || undefined,
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
        request: { ...request },
        response: responseState,
        timestamp: Date.now(),
      };
      addToHistory(historyItem);
      setHistory(getHistory());
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
  }, [request]);

  const handleSaveCurrentRequest = useCallback(() => {
    const name = window.prompt('Save request as:', request.url || 'New Request');
    if (!name) return;
    const item: SavedRequest = {
      id: genId(),
      name,
      request: { ...request },
      createdAt: Date.now(),
    };
    saveRequest(item);
    setSaved(getSaved());
  }, [request]);

  const handleDeleteSaved = useCallback((id: string) => {
    deleteSaved(id);
    setSaved(getSaved());
  }, []);

  const handleLoadRequest = useCallback((req: RequestState) => {
    setRequest(req);
    setResponse(null);
  }, []);

  const handleClearHistory = useCallback(() => {
    localStorage.removeItem('api-tester-history');
    setHistory([]);
  }, []);

  return (
    <div className={`flex flex-col h-screen ${theme === 'dark' ? 'bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900'}`}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 font-bold text-lg">⚡ API Tester</span>
        </div>
        <button
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      {/* URL Bar */}
      <UrlBar
        method={request.method}
        url={request.url}
        loading={loading}
        onMethodChange={(m: HttpMethod) => updateRequest({ method: m })}
        onUrlChange={handleUrlChange}
        onSend={handleSend}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-72 flex-shrink-0 overflow-hidden">
            <Sidebar
              history={history}
              saved={saved}
              onLoadRequest={handleLoadRequest}
              onSaveCurrentRequest={handleSaveCurrentRequest}
              onDeleteSaved={handleDeleteSaved}
              onClearHistory={handleClearHistory}
            />
          </div>
        )}

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="flex-shrink-0 w-5 flex items-center justify-center bg-gray-800 hover:bg-gray-700 border-x border-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Request + Response panels */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Request Panel */}
          <div className="flex-none h-[40%] border-b border-gray-700 overflow-hidden">
            <RequestPanel
              method={request.method}
              params={request.params}
              headers={request.headers}
              body={request.body}
              contentType={request.contentType}
              onParamsChange={handleParamsChange}
              onHeadersChange={h => updateRequest({ headers: h })}
              onBodyChange={b => updateRequest({ body: b })}
              onContentTypeChange={ct => updateRequest({ contentType: ct })}
            />
          </div>

          {/* Response Panel */}
          <div className="flex-1 overflow-hidden">
            <ResponsePanel response={response} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}
