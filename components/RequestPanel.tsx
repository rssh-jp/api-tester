'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { KeyValuePair, HttpMethod } from '@/lib/types';
import KeyValueTable from './KeyValueTable';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

interface RequestPanelProps {
  method: HttpMethod;
  params: KeyValuePair[];
  headers: KeyValuePair[];
  body: string;
  contentType: string;
  inheritedHeaders?: KeyValuePair[];
  inheritedParams?: KeyValuePair[];
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

function OverridableValueInput({
  inheritedValue,
  onOverride,
}: {
  inheritedValue: string;
  onOverride: (value: string) => void;
}) {
  const [value, setValue] = useState(inheritedValue);

  const commit = () => {
    if (value.trim() === '') {
      // Revert: don't create an override, reset display to inherited
      setValue(inheritedValue);
    } else if (value !== inheritedValue) {
      onOverride(value);
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      title="Edit to override this inherited value"
      className="bg-indigo-950/20 border border-indigo-500/15 rounded-lg px-3 py-1.5 text-sm text-slate-400 font-mono w-full focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 focus:text-slate-200 focus:bg-[#161b27] hover:border-indigo-500/30 transition-colors"
    />
  );
}

function InheritedRows({
  pairs,
  requestPairs,
  onRequestPairsChange,
}: {
  pairs: KeyValuePair[];
  requestPairs: KeyValuePair[];
  onRequestPairsChange: (pairs: KeyValuePair[]) => void;
}) {
  const visible = pairs.filter(
    p => !requestPairs.some(rp => rp.key.toLowerCase() === p.key.toLowerCase())
  );

  if (visible.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-1 mb-0.5">
        <Lock size={10} className="text-indigo-400/50" />
        <span className="text-[10px] uppercase tracking-widest text-indigo-400/50 font-medium">From category</span>
      </div>
      {visible.map(pair => (
        <div key={pair.id} className="grid grid-cols-[1fr_1fr] gap-2">
          <div className="bg-indigo-950/20 border border-indigo-500/15 rounded-lg px-3 py-1.5 text-sm text-slate-400 font-mono truncate opacity-60">
            {pair.key}
          </div>
          <OverridableValueInput
            key={pair.id + pair.value}
            inheritedValue={pair.value}
            onOverride={newValue => {
              onRequestPairsChange([
                ...requestPairs,
                { id: genId(), key: pair.key, value: newValue, enabled: true },
              ]);
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function RequestPanel({
  method,
  params,
  headers,
  body,
  contentType,
  inheritedHeaders = [],
  inheritedParams = [],
  onParamsChange,
  onHeadersChange,
  onBodyChange,
  onContentTypeChange,
}: RequestPanelProps) {
  const showBody = BODY_METHODS.includes(method);

  const inheritedParamKeys = inheritedParams.map(p => p.key);
  const inheritedHeaderKeys = inheritedHeaders.map(h => h.key);

  // When a locked (inherited) key's value is cleared in KeyValueTable, remove the override
  // so it reverts back to the "From category" section.
  const handleParamsChange = (newPairs: KeyValuePair[]) => {
    const inheritedSet = new Set(inheritedParamKeys.map(k => k.toLowerCase()));
    const cleaned = newPairs.filter(
      p => !(inheritedSet.has(p.key.toLowerCase()) && p.value.trim() === '')
    );
    onParamsChange(cleaned);
  };

  const handleHeadersChange = (newPairs: KeyValuePair[]) => {
    const inheritedSet = new Set(inheritedHeaderKeys.map(k => k.toLowerCase()));
    const cleaned = newPairs.filter(
      p => !(inheritedSet.has(p.key.toLowerCase()) && p.value.trim() === '')
    );
    onHeadersChange(cleaned);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] overflow-y-auto">
      <div className="px-4 py-3 border-b border-slate-800/60">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Query Params</span>
        <div className="mt-3">
          <KeyValueTable
            pairs={params}
            onChange={handleParamsChange}
            keyPlaceholder="Parameter name"
            valuePlaceholder="Value"
            lockedKeys={inheritedParamKeys}
          />
        </div>
        <InheritedRows pairs={inheritedParams} requestPairs={params} onRequestPairsChange={handleParamsChange} />
      </div>
      <div className="px-4 py-3 border-b border-slate-800/60">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Headers</span>
        <div className="mt-3">
          <KeyValueTable
            pairs={headers}
            onChange={handleHeadersChange}
            showEnabled
            keyPlaceholder="Header name"
            valuePlaceholder="Value"
            lockedKeys={inheritedHeaderKeys}
          />
        </div>
        <InheritedRows pairs={inheritedHeaders} requestPairs={headers} onRequestPairsChange={handleHeadersChange} />
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
