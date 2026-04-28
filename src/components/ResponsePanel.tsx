'use client';

import { useState } from 'react';
import { ResponseState } from '@/lib/types';
import JsonViewer from './JsonViewer';
import HtmlViewer from './HtmlViewer';
import XmlViewer from './XmlViewer';
import ImageViewer from './ImageViewer';

type ViewerType = 'html' | 'json' | 'xml' | 'image' | 'text' | 'binary';

function detectViewerType(response: ResponseState): ViewerType {
  const ct = (response.contentType ?? '').split(';')[0].trim().toLowerCase();
  if (response.isBinary) {
    return ct.startsWith('image/') ? 'image' : 'binary';
  }
  if (ct === 'text/html') return 'html';
  if (ct === 'application/json' || ct === 'text/json') return 'json';
  if (ct === 'text/xml' || ct === 'application/xml' || ct.endsWith('+xml')) return 'xml';
  if (ct.startsWith('image/')) return 'image';
  if (ct === 'text/plain' || ct.startsWith('text/')) return 'text';
  if (!ct) {
    try { JSON.parse(response.body); return 'json'; } catch { return 'text'; }
  }
  return 'text';
}

interface ResponsePanelProps {
  response: ResponseState | null;
  loading: boolean;
}

function StatusBadge({ status }: { status: number }) {
  let classes = 'bg-slate-500/15 text-slate-400 border border-slate-500/30';
  if (status >= 200 && status < 300) classes = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
  else if (status >= 300 && status < 400) classes = 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
  else if (status >= 400) classes = 'bg-red-500/15 text-red-400 border border-red-500/30';

  return (
    <span className={`${classes} rounded-full px-2.5 py-0.5 text-xs font-bold`}>
      {status}
    </span>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

export default function ResponsePanel({ response, loading }: ResponsePanelProps) {
  const [activeTab, setActiveTab] = useState('Body');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117] text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">リクエストを送信中…</span>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117] text-slate-500">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-base font-medium text-slate-600">まだレスポンスがありません</p>
          <p className="text-sm text-slate-700">リクエストを送信するとレスポンスがここに表示されます</p>
        </div>
      </div>
    );
  }

  if (response.error) {
    return (
      <div className="flex flex-col h-full bg-[#0d1117]">
        <div className="p-4 border-b border-slate-800 flex flex-col gap-1.5">
          <span className="bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-bold px-2.5 py-0.5 rounded-full w-fit">Error</span>
          {response.sentUrl && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] uppercase tracking-widest text-slate-600 font-medium flex-shrink-0">URL</span>
              <span className="text-xs font-mono text-slate-500 truncate" title={response.sentUrl}>{response.sentUrl}</span>
            </div>
          )}
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl mx-4 my-4 p-4 text-red-400 text-sm font-mono">{response.error}</div>
      </div>
    );
  }

  const responseHeaders = Object.entries(response.headers);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Status bar */}
      <div className="bg-[#0d1117] border-b border-slate-800 px-4 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <StatusBadge status={response.status} />
          <span className="text-sm text-slate-400">{response.statusText}</span>
          <span className="bg-slate-800/50 rounded px-1.5 py-0.5 text-xs text-slate-400 font-mono">{response.responseTime} ms</span>
          <span className="bg-slate-800/50 rounded px-1.5 py-0.5 text-xs text-slate-400 font-mono">{formatSize(response.size)}</span>
        </div>
        {response.sentUrl && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] uppercase tracking-widest text-slate-600 font-medium flex-shrink-0">URL</span>
            <span className="text-xs font-mono text-slate-500 truncate" title={response.sentUrl}>{response.sentUrl}</span>
          </div>
        )}
      </div>

      {/* Redirect notice */}
      {response.redirected && response.finalUrl && (
        <div className="mx-4 mt-3 flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs">
          <span className="text-amber-400 font-semibold flex-shrink-0">↪ リダイレクト</span>
          <span className="text-amber-300/70 font-mono break-all">{response.finalUrl}</span>
        </div>
      )}

      {/* Binary / image response warning */}
      {response.isBinary && (
        <div className="mx-4 mt-3 flex items-start gap-2 bg-slate-500/8 border border-slate-500/20 rounded-lg px-3 py-2.5 text-xs">
          <span className="text-slate-400 font-semibold flex-shrink-0">⚠ バイナリレスポンス</span>
          <span className="text-slate-400 break-all">
            Content-Type: <span className="font-mono text-indigo-300">{response.contentType || 'unknown'}</span>
            {response.redirected && ' — リクエストがバイナリファイル（画像など）へリダイレクトされています。URLを確認してください。'}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1.5 bg-[#080c14] border-b border-slate-800">
        {['Body', 'Headers'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
            {tab === 'Headers' && responseHeaders.length > 0 && (
              <span className="ml-1 text-[10px] bg-indigo-500/20 text-indigo-400 rounded-full px-1.5 py-0.5">
                {responseHeaders.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'Body' && (() => {
          const viewerType = detectViewerType(response);
          switch (viewerType) {
            case 'html':
              return <HtmlViewer content={response.body} />;
            case 'json':
              return <JsonViewer content={response.body} />;
            case 'xml':
              return <XmlViewer content={response.body} />;
            case 'image':
              return <ImageViewer body={response.body} contentType={response.contentType ?? ''} isBinary={response.isBinary} />;
            case 'binary':
              return (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">🖼️</div>
                  <p className="text-sm font-medium text-slate-300">バイナリ / 画像レスポンス</p>
                  <p className="text-xs text-slate-500 font-mono">{response.contentType || 'unknown content-type'}</p>
                  <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
                    このレスポンスはテキストとして表示できません。
                    {response.redirected ? ' リクエストがリダイレクトされた先にバイナリファイルがあります。URL を確認してください。' : ''}
                  </p>
                </div>
              );
            case 'text':
            default:
              return (
                <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-300 bg-[#0d1117] leading-relaxed whitespace-pre-wrap break-all h-full">
                  {response.body}
                </pre>
              );
          }
        })()}
        {activeTab === 'Headers' && (
          <div className="overflow-auto h-full p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-800">
                  <th className="pb-2 pr-4 font-medium text-slate-500 w-1/3">Name</th>
                  <th className="pb-2 font-medium text-slate-500">Value</th>
                </tr>
              </thead>
              <tbody>
                {responseHeaders.map(([key, value]) => (
                  <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 pr-4 font-mono text-indigo-300 align-top">{key}</td>
                    <td className="py-2 font-mono text-slate-300 break-all">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
