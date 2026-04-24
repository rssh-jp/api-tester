'use client';

import { useState } from 'react';
import { ResponseState } from '@/lib/types';
import JsonViewer from './JsonViewer';

interface ResponsePanelProps {
  response: ResponseState | null;
  loading: boolean;
}

function StatusBadge({ status }: { status: number }) {
  let color = 'bg-gray-600';
  if (status >= 200 && status < 300) color = 'bg-green-600';
  else if (status >= 300 && status < 400) color = 'bg-orange-500';
  else if (status >= 400) color = 'bg-red-600';

  return (
    <span className={`${color} text-white text-xs font-bold px-2.5 py-1 rounded`}>
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
      <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Sending request...</span>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-gray-500">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-lg font-medium">No response yet</p>
          <p className="text-sm">Send a request to see the response here</p>
        </div>
      </div>
    );
  }

  if (response.error) {
    return (
      <div className="flex flex-col h-full bg-gray-900">
        <div className="p-4 border-b border-gray-700">
          <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded">Error</span>
        </div>
        <div className="p-4 text-red-400 text-sm font-mono">{response.error}</div>
      </div>
    );
  }

  const responseHeaders = Object.entries(response.headers);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-700">
        <StatusBadge status={response.status} />
        <span className="text-sm text-gray-400">{response.statusText}</span>
        <span className="text-sm text-gray-500">•</span>
        <span className="text-sm text-gray-400">{response.responseTime} ms</span>
        <span className="text-sm text-gray-500">•</span>
        <span className="text-sm text-gray-400">{formatSize(response.size)}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {['Body', 'Headers'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab}
            {tab === 'Headers' && responseHeaders.length > 0 && (
              <span className="ml-1 text-xs bg-gray-600 text-gray-300 rounded-full px-1.5 py-0.5">
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
                <tr className="text-left border-b border-gray-700">
                  <th className="pb-2 pr-4 font-medium text-gray-400 w-1/3">Name</th>
                  <th className="pb-2 font-medium text-gray-400">Value</th>
                </tr>
              </thead>
              <tbody>
                {responseHeaders.map(([key, value]) => (
                  <tr key={key} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-2 pr-4 font-mono text-blue-300 align-top">{key}</td>
                    <td className="py-2 font-mono text-gray-300 break-all">{value}</td>
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
