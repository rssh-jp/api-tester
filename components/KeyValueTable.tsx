'use client';
import { Plus, Trash2 } from 'lucide-react';
import { KeyValuePair } from '@/lib/types';

interface KeyValueTableProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  showEnabled?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

export default function KeyValueTable({ pairs, onChange, showEnabled = false, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }: KeyValueTableProps) {
  const add = () => onChange([...pairs, { id: genId(), key: '', value: '', enabled: true }]);
  const remove = (id: string) => onChange(pairs.filter(p => p.id !== id));
  const update = (id: string, field: keyof KeyValuePair, value: string | boolean) =>
    onChange(pairs.map(p => p.id === id ? { ...p, [field]: value } : p));

  return (
    <div className="flex flex-col gap-1.5">
      {pairs.length > 0 && (
        <div className={`grid gap-2 px-1 mb-0.5 ${showEnabled ? 'grid-cols-[16px_1fr_1fr_28px]' : 'grid-cols-[1fr_1fr_28px]'}`}>
          {showEnabled && <span />}
          <span className="text-[10px] uppercase tracking-widest text-slate-600 font-medium pl-2">Key</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-600 font-medium pl-2">Value</span>
          <span />
        </div>
      )}
      {pairs.map(pair => (
        <div key={pair.id} className={`grid gap-2 items-center ${showEnabled ? 'grid-cols-[16px_1fr_1fr_28px]' : 'grid-cols-[1fr_1fr_28px]'}`}>
          {showEnabled && (
            <input
              type="checkbox"
              checked={pair.enabled}
              onChange={e => update(pair.id, 'enabled', e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30 cursor-pointer accent-indigo-500"
            />
          )}
          <input
            type="text"
            value={pair.key}
            onChange={e => update(pair.id, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className={`bg-[#161b27] border border-slate-700/60 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 font-mono ${!pair.enabled && showEnabled ? 'opacity-40' : ''}`}
          />
          <input
            type="text"
            value={pair.value}
            onChange={e => update(pair.id, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className={`bg-[#161b27] border border-slate-700/60 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 font-mono ${!pair.enabled && showEnabled ? 'opacity-40' : ''}`}
          />
          <button
            onClick={() => remove(pair.id)}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1.5 mt-1 px-3 py-1.5 text-xs text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/5 rounded-lg w-fit"
      >
        <Plus size={12} />
        Add row
      </button>
    </div>
  );
}
