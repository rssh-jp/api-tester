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

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function KeyValueTable({
  pairs,
  onChange,
  showEnabled = false,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: KeyValueTableProps) {
  const add = () => {
    onChange([...pairs, { id: genId(), key: '', value: '', enabled: true }]);
  };

  const remove = (id: string) => {
    onChange(pairs.filter(p => p.id !== id));
  };

  const update = (id: string, field: keyof KeyValuePair, value: string | boolean) => {
    onChange(pairs.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  return (
    <div className="flex flex-col gap-1">
      {pairs.map(pair => (
        <div key={pair.id} className="flex items-center gap-2">
          {showEnabled && (
            <input
              type="checkbox"
              checked={pair.enabled}
              onChange={e => update(pair.id, 'enabled', e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 flex-shrink-0"
            />
          )}
          <input
            type="text"
            value={pair.key}
            onChange={e => update(pair.id, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={pair.value}
            onChange={e => update(pair.id, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => remove(pair.id)}
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-2 mt-1 px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors w-fit"
      >
        <Plus size={14} />
        Add row
      </button>
    </div>
  );
}
