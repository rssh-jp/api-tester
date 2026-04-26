'use client';

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

  return (
    <div className="flex flex-col h-full bg-[#0d1117] overflow-y-auto">
      <div className="px-4 py-3 border-b border-slate-800/60">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Query Params</span>
        <div className="mt-3">
          <KeyValueTable
            pairs={params}
            onChange={onParamsChange}
            keyPlaceholder="Parameter name"
            valuePlaceholder="Value"
          />
        </div>
      </div>
      <div className="px-4 py-3 border-b border-slate-800/60">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Headers</span>
        <div className="mt-3">
          <KeyValueTable
            pairs={headers}
            onChange={onHeadersChange}
            showEnabled
            keyPlaceholder="Header name"
            valuePlaceholder="Value"
          />
        </div>
      </div>
      {showBody && (
        <div className="px-4 py-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Body</span>
          <div className="mt-3 flex flex-col gap-3">
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
              className="min-h-[120px] bg-[#161b27] border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
