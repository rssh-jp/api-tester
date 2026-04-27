'use client';

import { Fragment, useState } from 'react';
import { Folder, GitBranch, Info } from 'lucide-react';
import { Category, KeyValuePair, SavedRequest } from '@/lib/types';
import { buildCategoryChain } from '@/lib/inheritance';
import KeyValueTable from './KeyValueTable';
import BatchRunTab from './BatchRunTab';

interface CategoryEditorProps {
  category: Category;
  categories: Category[];
  requests: SavedRequest[];
  onChange: (updated: Category) => void;
  onSelectRequest: (id: string) => void;
}

type Tab = 'Settings' | 'Batch Run';
const TABS: Tab[] = ['Settings', 'Batch Run'];

export default function CategoryEditor({ category, categories, requests, onChange, onSelectRequest }: CategoryEditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Batch Run');

  // Build breadcrumb path: root → ... → parent (reversed ancestor chain)
  const ancestorChain = buildCategoryChain(category.parentId, categories);
  const breadcrumb = [...ancestorChain].reverse();

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-slate-200">
      {/* Header area */}
      <div className="px-6 pt-6 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <Folder size={18} className="text-amber-500/70 flex-shrink-0" />
          <input
            type="text"
            value={category.name}
            onChange={e => onChange({ ...category, name: e.target.value })}
            placeholder="Category name"
            className="flex-1 bg-transparent text-xl font-semibold text-slate-100 border-b border-transparent hover:border-slate-700 focus:border-indigo-500/80 focus:outline-none px-0 py-0.5"
          />
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-slate-600 mb-3 ml-6 flex-wrap">
          <span>Root</span>
          {breadcrumb.map(cat => (
            <Fragment key={cat.id}>
              <span className="text-slate-700">›</span>
              <span className="text-slate-500">{cat.name}</span>
            </Fragment>
          ))}
          <span className="text-slate-700">›</span>
          <span className="text-slate-400 font-medium">{category.name || 'Unnamed'}</span>
        </div>

        {/* Description */}
        <textarea
          value={category.description ?? ''}
          onChange={e => onChange({ ...category, description: e.target.value })}
          placeholder="Description (optional)"
          rows={2}
          className="w-full bg-[#161b27] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 resize-none"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1.5 bg-[#080c14] border-b border-slate-800">
        {TABS.map(tab => (
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
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={`flex-1 ${activeTab === 'Batch Run' ? 'overflow-hidden' : 'overflow-auto p-5'}`}>
        {activeTab === 'Settings' && (
          <div className="flex flex-col gap-8">
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Default Headers</h3>
              <div className="flex items-start gap-2 mb-4 bg-indigo-500/5 border border-indigo-500/20 rounded-lg px-3 py-2.5 text-xs text-slate-400">
                <Info size={14} className="mt-0.5 flex-shrink-0 text-indigo-400" />
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
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Default Parameters</h3>
              <div className="flex items-start gap-2 mb-4 bg-indigo-500/5 border border-indigo-500/20 rounded-lg px-3 py-2.5 text-xs text-slate-400">
                <Info size={14} className="mt-0.5 flex-shrink-0 text-indigo-400" />
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
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Variables</h3>
              <div className="flex items-start gap-2 mb-4 bg-indigo-500/5 border border-indigo-500/20 rounded-lg px-3 py-2.5 text-xs text-slate-400">
                <Info size={14} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                <span>
                  Use <code className="text-indigo-300 font-mono">${'{VARIABLE_NAME}'}</code> in URL, headers, params, and body. Child category values take precedence over parents.
                </span>
              </div>
              <KeyValueTable
                pairs={category.variables}
                onChange={newPairs => onChange({ ...category, variables: newPairs })}
                showEnabled={true}
                keyPlaceholder="Variable name"
                valuePlaceholder="Value"
              />
            </section>

            <section>
              <InheritancePreview category={category} categories={categories} />
            </section>
          </div>
        )}

        {activeTab === 'Batch Run' && (
          <BatchRunTab
            category={category}
            categories={categories}
            requests={requests}
            onSelectRequest={onSelectRequest}
          />
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
  variables,
  depth,
  isCurrent,
  isRoot,
}: {
  name: string;
  defaultHeaders: KeyValuePair[];
  defaultParams: KeyValuePair[];
  variables: KeyValuePair[];
  depth: number;
  isCurrent?: boolean;
  isRoot?: boolean;
}) {
  const borderColor = isCurrent ? 'border-indigo-500/40' : isRoot ? 'border-amber-500/30' : 'border-slate-800';
  const folderColor = isCurrent ? 'text-indigo-400' : isRoot ? 'text-amber-500/70' : 'text-slate-500';
  const labelColor = isCurrent ? 'text-indigo-300' : isRoot ? 'text-amber-400/80' : 'text-slate-300';

  return (
    <div
      className={`bg-[#161b27] border rounded-xl p-4 ${borderColor}`}
      style={{ marginLeft: `${depth * 16}px` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Folder size={14} className={folderColor} />
        <span className={`text-sm font-medium ${labelColor}`}>{name}</span>
        {isRoot && (
          <span className="text-xs text-amber-600/70 ml-1">(highest priority)</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className="text-xs text-slate-500 uppercase tracking-wide">Headers</span>
          <div className="mt-1">
            <KVSummary pairs={defaultHeaders} />
          </div>
        </div>
        <div>
          <span className="text-xs text-slate-500 uppercase tracking-wide">Params</span>
          <div className="mt-1">
            <KVSummary pairs={defaultParams} />
          </div>
        </div>
        <div>
          <span className="text-xs text-slate-500 uppercase tracking-wide">Variables</span>
          <div className="mt-1">
            <KVSummary pairs={variables} />
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
      <div className="flex items-start gap-2 mb-4 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs text-amber-400/80">
        <GitBranch size={14} className="mt-0.5 flex-shrink-0" />
        <span>⚠ Root category settings take highest priority and override all sub-categories.</span>
      </div>

      <div className="flex flex-col gap-3">
        <InheritanceCard
          name={`${category.name || 'Unnamed'} (this)`}
          defaultHeaders={category.defaultHeaders}
          defaultParams={category.defaultParams}
          variables={category.variables}
          depth={0}
          isCurrent
        />
        {ancestorChain.map((cat, i) => (
          <InheritanceCard
            key={cat.id}
            name={cat.name}
            defaultHeaders={cat.defaultHeaders}
            defaultParams={cat.defaultParams}
            variables={cat.variables ?? []}
            depth={i + 1}
            isRoot={i === ancestorChain.length - 1}
          />
        ))}
        {ancestorChain.length === 0 && (
          <p className="text-sm text-slate-600 italic mt-1 ml-1">
            This is a root-level category with no parents.
          </p>
        )}
      </div>
    </div>
  );
}
