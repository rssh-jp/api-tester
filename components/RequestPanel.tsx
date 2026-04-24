'use client';

import { useState } from 'react';
import { KeyValuePair, HttpMethod } from '@/lib/types';
import KeyValueTable from './KeyValueTable';

interface RequestPanelProps {
  method: HttpMethod;
  params: KeyValuePair[];
  headers: KeyValuePair[];
  body: string;
  contentType: string;
  onParamsChange: (params: KeyValuePair[]) => void;
  onHeadersChange: (headers: KeyValuePair[]) => void;
  onBodyChange: (body: string) => void;
  onContentTypeChange: (ct: string) => void;
}

const CONTENT_TYPES = [
  { label: 'application/json', value: 'application/json' },
  { label: 'application/x-www-form-urlencoded', value: 'application/x-www-form-urlencoded' },
  { label: 'text/plain', value: 'text/plain' },
  { label: 'text/xml', value: 'text/xml' },
  { label: 'text/html', value: 'text/html' },
];

const BODY_METHODS: HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

export default function RequestPanel({
  method,
  params,
  headers,
  body,
  contentType,
  onParamsChange,
  onHeadersChange,
  onBodyChange,
  onContentTypeChange,
}: RequestPanelProps) {
  const showBody = BODY_METHODS.includes(method);
  const tabs = ['Params', 'Headers', ...(showBody ? ['Body'] : [])];
  const [activeTab, setActiveTab] = useState('Params');

  const currentTab = tabs.includes(activeTab) ? activeTab : 'Params';

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="flex gap-1 p-1.5 bg-[#080c14] border-b border-slate-800">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              currentTab === tab
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
            {tab === 'Params' && params.filter(p => p.key).length > 0 && (
              <span className="ml-1 text-[10px] bg-indigo-500/20 text-indigo-400 rounded-full px-1.5 py-0.5">
                {params.filter(p => p.key).length}
              </span>
            )}
            {tab === 'Headers' && headers.filter(h => h.key && h.enabled).length > 0 && (
              <span className="ml-1 text-[10px] bg-indigo-500/20 text-indigo-400 rounded-full px-1.5 py-0.5">
                {headers.filter(h => h.key && h.enabled).length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {currentTab === 'Params' && (
          <KeyValueTable
            pairs={params}
            onChange={onParamsChange}
            keyPlaceholder="Parameter name"
            valuePlaceholder="Value"
          />
        )}
        {currentTab === 'Headers' && (
          <KeyValueTable
            pairs={headers}
            onChange={onHeadersChange}
            showEnabled
            keyPlaceholder="Header name"
            valuePlaceholder="Value"
          />
        )}
        {currentTab === 'Body' && (
          <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Content-Type:</label>
              <select
                value={contentType}
                onChange={e => onContentTypeChange(e.target.value)}
                className="bg-[#161b27] border border-slate-700/60 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20"
              >
                {CONTENT_TYPES.map(ct => (
                  <option key={ct.value} value={ct.value}>
                    {ct.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={body}
              onChange={e => onBodyChange(e.target.value)}
              placeholder={contentType === 'application/json' ? '{\n  "key": "value"\n}' : 'Request body...'}
              className="flex-1 min-h-[120px] bg-[#161b27] border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
