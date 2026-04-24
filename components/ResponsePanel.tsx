'use client';

import { useState } from 'react';
import { ResponseState } from '@/lib/types';
import JsonViewer from './JsonViewer';

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
          <span className="text-sm text-slate-500">Sending request…</span>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117] text-slate-500">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-base font-medium text-slate-600">No response yet</p>
          <p className="text-sm text-slate-700">Send a request to see the response here</p>
        </div>
      </div>
    );
  }

  if (response.error) {
    return (
      <div className="flex flex-col h-full bg-[#0d1117]">
        <div className="p-4 border-b border-slate-800">
          <span className="bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-bold px-2.5 py-0.5 rounded-full">Error</span>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl mx-4 my-4 p-4 text-red-400 text-sm font-mono">{response.error}</div>
      </div>
    );
  }

  const responseHeaders = Object.entries(response.headers);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Status bar */}
      <div className="bg-[#0d1117] border-b border-slate-800 px-4 py-2.5 flex items-center gap-3">
        <StatusBadge status={response.status} />
        <span className="text-sm text-slate-400">{response.statusText}</span>
        <span className="bg-slate-800/50 rounded px-1.5 py-0.5 text-xs text-slate-400 font-mono">{response.responseTime} ms</span>
        <span className="bg-slate-800/50 rounded px-1.5 py-0.5 text-xs text-slate-400 font-mono">{formatSize(response.size)}</span>
      </div>

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
        {activeTab === 'Body' && <JsonViewer content={response.body} />}
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
