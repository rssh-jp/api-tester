'use client';

import { useState, useRef } from 'react';
import { Play, RotateCcw, Loader2, Inbox, CheckCircle2, XCircle } from 'lucide-react';
import {
  Category,
  SavedRequest,
  BatchRunStatus,
  BatchRunResult,
  HttpMethod,
} from '@/lib/types';
import { computeEffectiveValues, computeEffectiveVariables, applyVariables } from '@/lib/inheritance';
import { buildUrlWithParams, extractBaseUrl } from '@/lib/urlBuilder';
import { sendRequest } from '@/lib/sendRequest';

interface BatchRunTabProps {
  category: Category;
  categories: Category[];
  requests: SavedRequest[];
  onSelectRequest: (id: string) => void;
}

const METHOD_BG: Record<string, string> = {
  GET:     'bg-emerald-500/15 text-emerald-400',
  POST:    'bg-amber-500/15 text-amber-400',
  PUT:     'bg-blue-500/15 text-blue-400',
  DELETE:  'bg-red-500/15 text-red-400',
  PATCH:   'bg-orange-500/15 text-orange-400',
  HEAD:    'bg-purple-500/15 text-purple-400',
  OPTIONS: 'bg-pink-500/15 text-pink-400',
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_BG[method] ?? 'text-slate-400'}`}>
      {method}
    </span>
  );
}

function StatusCell({ result }: { result: BatchRunResult }) {
  if (result.status === 'running') return <span className="text-slate-400">実行中</span>;
  if (result.status === 'skipped') return <span className="text-slate-600">スキップ</span>;
  if (result.status === 'pending') return <span className="text-slate-600">—</span>;
  if (result.error) return <span className="text-red-400">エラー</span>;
  if (result.httpStatus != null) {
    return (
      <span className={result.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
        {result.httpStatus} {result.httpStatusText}
      </span>
    );
  }
  return <span className="text-slate-600">—</span>;
}

function StatusIcon({ status }: { status: BatchRunStatus }) {
  if (status === 'success') return <CheckCircle2 size={14} className="text-emerald-400" />;
  if (status === 'failure') return <XCircle size={14} className="text-red-400" />;
  if (status === 'running') {
    return <Loader2 size={14} className="animate-spin text-indigo-400" role="status" />;
  }
  return <span className="text-slate-700 text-xs">—</span>;
}

export default function BatchRunTab({
  category,
  categories,
  requests,
  onSelectRequest,
}: BatchRunTabProps) {
  const [results, setResults] = useState<BatchRunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [includeSubcategories, setIncludeSubcategories] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [prevCategoryId, setPrevCategoryId] = useState(category.id);
  const abortRef = useRef(false);

  if (prevCategoryId !== category.id) {
    abortRef.current = true;
    setPrevCategoryId(category.id);
    setResults([]);
    setHasRun(false);
    setRunning(false);
  }

  function collectRequests(categoryId: string, includeSubcats: boolean): SavedRequest[] {
    const direct = requests.filter(r => r.categoryId === categoryId);
    if (!includeSubcats) return direct;
    const children = categories.filter(c => c.parentId === categoryId);
    const childRequests = children.flatMap(c => collectRequests(c.id, true));
    return [...direct, ...childRequests];
  }

  const targets = collectRequests(category.id, includeSubcategories);

  const displayResults: BatchRunResult[] =
    results.length > 0
      ? results
      : targets.map(req => ({
          requestId: req.id,
          requestName: req.name,
          method: req.request.method,
          url: req.request.url,
          status: 'pending' as BatchRunStatus,
        }));

  async function runAll() {
    const currentTargets = collectRequests(category.id, includeSubcategories);
    if (currentTargets.length === 0) return;

    abortRef.current = false;
    setRunning(true);
    setHasRun(false);
    setResults(
      currentTargets.map(req => ({
        requestId: req.id,
        requestName: req.name,
        method: req.request.method,
        url: req.request.url,
        status: 'pending' as BatchRunStatus,
      }))
    );

    for (const req of currentTargets) {
      if (abortRef.current) break;

      setResults(prev =>
        prev.map(r => r.requestId === req.id ? { ...r, status: 'running' } : r)
      );

      if (!req.request.url.trim()) {
        setResults(prev =>
          prev.map(r => r.requestId === req.id ? { ...r, status: 'skipped' } : r)
        );
        continue;
      }

      try {
        const { headers: effectiveHeaders, params: effectiveParams } =
          computeEffectiveValues(
            req.request.headers,
            req.request.params,
            req.categoryId,
            categories
          );

        const variables = computeEffectiveVariables(req.categoryId, categories);

        const resolvedUrl = applyVariables(req.request.url, variables);
        const resolvedHeaders = effectiveHeaders.map(h => ({ ...h, value: applyVariables(h.value, variables) }));
        const resolvedParams = effectiveParams.map(p => ({ ...p, value: applyVariables(p.value, variables) }));
        const resolvedBody = applyVariables(req.request.body, variables);

        const finalUrl = buildUrlWithParams(extractBaseUrl(resolvedUrl), resolvedParams);

        const headersObj: Record<string, string> = {};
        resolvedHeaders.forEach(h => { headersObj[h.key] = h.value; });
        if (
          req.request.contentType &&
          ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.request.method)
        ) {
          headersObj['Content-Type'] = req.request.contentType;
        }

        const data = await sendRequest({
          method: req.request.method,
          url: finalUrl,
          headers: headersObj,
          body: resolvedBody || undefined,
        });

        if (data.error) {
          setResults(prev =>
            prev.map(r =>
              r.requestId === req.id
                ? { ...r, status: 'failure', error: data.error, responseTime: data.responseTime }
                : r
            )
          );
          continue;
        }

        const isSuccess = (data.status ?? 0) >= 200 && (data.status ?? 0) < 300;
        setResults(prev =>
          prev.map(r =>
            r.requestId === req.id
              ? {
                  ...r,
                  status: isSuccess ? 'success' : 'failure',
                  httpStatus: data.status,
                  httpStatusText: data.statusText,
                  responseTime: data.responseTime,
                }
              : r
          )
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Network error';
        setResults(prev =>
          prev.map(r =>
            r.requestId === req.id ? { ...r, status: 'failure', error: message } : r
          )
        );
      }
    }

    if (!abortRef.current) {
      setRunning(false);
      setHasRun(true);
    }
  }

  const allDone = hasRun && !running;
  const passed = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failure').length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeSubcategories}
            onChange={e => setIncludeSubcategories(e.target.checked)}
            disabled={running}
            className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/40"
          />
          サブカテゴリーを含める
        </label>

        <button
          onClick={runAll}
          disabled={running || targets.length === 0}
          aria-disabled={running || targets.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {running ? (
            <>
              <Loader2 size={14} className="animate-spin" role="status" />
              実行中…
            </>
          ) : hasRun ? (
            <>
              <RotateCcw size={14} />
              再実行
            </>
          ) : (
            <>
              <Play size={14} />
              すべて実行
            </>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {targets.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
            <Inbox size={28} />
            <p className="text-sm">このカテゴリーにリクエストがありません</p>
          </div>
        )}

        {targets.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-600 border-b border-slate-800">
                <th className="px-4 py-2 text-left w-20">Method</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">URL</th>
                <th className="px-4 py-2 text-right w-24">Status</th>
                <th className="px-4 py-2 text-right w-20">Time</th>
                <th className="px-4 py-2 text-center w-8"></th>
              </tr>
            </thead>
            <tbody>
              {displayResults.map(row => (
                <tr
                  key={row.requestId}
                  onClick={() => onSelectRequest(row.requestId)}
                  className={`border-b border-slate-800/50 cursor-pointer transition-colors ${
                    row.status === 'success'
                      ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                      : row.status === 'failure'
                      ? 'bg-red-500/5 hover:bg-red-500/10'
                      : 'hover:bg-slate-800/30'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <MethodBadge method={row.method} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-300 truncate max-w-[160px]">
                    {row.requestName}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono truncate max-w-[220px]">
                    {row.url || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <StatusCell result={row} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 font-mono">
                    {row.responseTime != null ? `${row.responseTime} ms` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusIcon status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {allDone && (
          <div className="px-5 py-3 border-t border-slate-800 text-sm text-slate-400 flex gap-4">
            <span className="text-emerald-400 font-semibold">{passed} 成功</span>
            <span className="text-red-400 font-semibold">{failed} 失敗</span>
            <span className="text-slate-600">{passed + failed} 合計</span>
          </div>
        )}
      </div>
    </div>
  );
}
