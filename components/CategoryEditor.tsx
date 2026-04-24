'use client';

import { Fragment, useState } from 'react';
import { Folder, GitBranch, Info } from 'lucide-react';
import { Category, KeyValuePair } from '@/lib/types';
import { buildCategoryChain } from '@/lib/inheritance';
import KeyValueTable from './KeyValueTable';

interface CategoryEditorProps {
  category: Category;
  categories: Category[];
  onChange: (updated: Category) => void;
}

type Tab = 'Default Headers' | 'Default Params' | 'Inheritance Preview';
const TABS: Tab[] = ['Default Headers', 'Default Params', 'Inheritance Preview'];

export default function CategoryEditor({ category, categories, onChange }: CategoryEditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Default Headers');

  // Build breadcrumb path: root → ... → parent (reversed ancestor chain)
  const ancestorChain = buildCategoryChain(category.parentId, categories);
  const breadcrumb = [...ancestorChain].reverse();

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200">
      {/* Header area */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <Folder size={18} className="text-yellow-400 flex-shrink-0" />
          <input
            type="text"
            value={category.name}
            onChange={e => onChange({ ...category, name: e.target.value })}
            placeholder="Category name"
            className="flex-1 bg-transparent text-xl font-semibold text-gray-100 border-b border-transparent hover:border-gray-600 focus:border-blue-500 focus:outline-none px-0.5 transition-colors"
          />
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-3 ml-6 flex-wrap">
          <span>Root</span>
          {breadcrumb.map(cat => (
            <Fragment key={cat.id}>
              <span className="text-gray-600">›</span>
              <span className="text-gray-400">{cat.name}</span>
            </Fragment>
          ))}
          <span className="text-gray-600">›</span>
          <span className="text-gray-300 font-medium">{category.name || 'Unnamed'}</span>
        </div>

        {/* Description */}
        <textarea
          value={category.description ?? ''}
          onChange={e => onChange({ ...category, description: e.target.value })}
          placeholder="Description (optional)"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {TABS.map(tab => (
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
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-5">
        {activeTab === 'Default Headers' && (
          <div>
            <div className="flex items-start gap-2 mb-4 text-sm text-gray-400 bg-gray-800 border border-gray-700 rounded px-3 py-2">
              <Info size={14} className="mt-0.5 flex-shrink-0 text-blue-400" />
              <span>
                These headers are applied to all requests in this category. Higher-level categories
                override these values.
              </span>
            </div>
            <KeyValueTable
              pairs={category.defaultHeaders}
              onChange={newPairs => onChange({ ...category, defaultHeaders: newPairs })}
              showEnabled={true}
              keyPlaceholder="Header name"
              valuePlaceholder="Value"
            />
          </div>
        )}

        {activeTab === 'Default Params' && (
          <div>
            <div className="flex items-start gap-2 mb-4 text-sm text-gray-400 bg-gray-800 border border-gray-700 rounded px-3 py-2">
              <Info size={14} className="mt-0.5 flex-shrink-0 text-blue-400" />
              <span>
                These query parameters are applied to all requests in this category. Higher-level
                categories override these values.
              </span>
            </div>
            <KeyValueTable
              pairs={category.defaultParams}
              onChange={newPairs => onChange({ ...category, defaultParams: newPairs })}
              showEnabled={true}
              keyPlaceholder="Parameter name"
              valuePlaceholder="Value"
            />
          </div>
        )}

        {activeTab === 'Inheritance Preview' && (
          <InheritancePreview category={category} categories={categories} />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KVSummary({ pairs }: { pairs: KeyValuePair[] }) {
  const active = pairs.filter(p => p.key && p.enabled);
  if (active.length === 0) {
    return <span className="text-gray-500 italic text-xs">None</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {active.map(p => (
        <span key={p.id} className="text-xs font-mono">
          <span className="text-blue-400">{p.key}</span>
          <span className="text-gray-500">: </span>
          <span className="text-green-400">{p.value}</span>
        </span>
      ))}
    </div>
  );
}

function InheritanceCard({
  name,
  defaultHeaders,
  defaultParams,
  depth,
  isCurrent,
  isRoot,
}: {
  name: string;
  defaultHeaders: KeyValuePair[];
  defaultParams: KeyValuePair[];
  depth: number;
  isCurrent?: boolean;
  isRoot?: boolean;
}) {
  const borderColor = isCurrent ? '#3b82f6' : isRoot ? '#f59e0b' : '#374151';
  const folderColor = isCurrent ? 'text-blue-400' : isRoot ? 'text-yellow-400' : 'text-gray-400';
  const labelColor = isCurrent ? 'text-blue-300' : isRoot ? 'text-yellow-300' : 'text-gray-300';

  return (
    <div
      className="bg-gray-800 border rounded p-3"
      style={{ marginLeft: `${depth * 16}px`, borderColor }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Folder size={14} className={folderColor} />
        <span className={`text-sm font-medium ${labelColor}`}>{name}</span>
        {isRoot && (
          <span className="text-xs text-yellow-600 ml-1">(highest priority)</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Headers</span>
          <div className="mt-1">
            <KVSummary pairs={defaultHeaders} />
          </div>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Params</span>
          <div className="mt-1">
            <KVSummary pairs={defaultParams} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InheritancePreview({
  category,
  categories,
}: {
  category: Category;
  categories: Category[];
}) {
  // [immediate parent, ..., root]
  const ancestorChain = buildCategoryChain(category.parentId, categories);

  return (
    <div>
      <div className="flex items-start gap-2 mb-4 text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-700/40 rounded px-3 py-2">
        <GitBranch size={14} className="mt-0.5 flex-shrink-0" />
        <span>⚠ Root category settings take highest priority and override all sub-categories.</span>
      </div>

      <div className="flex flex-col gap-3">
        <InheritanceCard
          name={`${category.name || 'Unnamed'} (this)`}
          defaultHeaders={category.defaultHeaders}
          defaultParams={category.defaultParams}
          depth={0}
          isCurrent
        />
        {ancestorChain.map((cat, i) => (
          <InheritanceCard
            key={cat.id}
            name={cat.name}
            defaultHeaders={cat.defaultHeaders}
            defaultParams={cat.defaultParams}
            depth={i + 1}
            isRoot={i === ancestorChain.length - 1}
          />
        ))}
        {ancestorChain.length === 0 && (
          <p className="text-sm text-gray-500 italic mt-1 ml-1">
            This is a root-level category with no parents.
          </p>
        )}
      </div>
    </div>
  );
}
