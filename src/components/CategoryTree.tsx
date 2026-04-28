'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  FileJson,
  Plus,
  Trash2,
  Edit2,
  Copy,
} from 'lucide-react';
import { Category, SavedRequest, Selection, DragItem, DragPhase, DropTarget } from '@/lib/types';
import { getExpandedCategories, saveExpandedCategories } from '@/lib/storage';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';

const METHOD_COLORS: Record<string, string> = {
  GET:     'bg-emerald-500/15 text-emerald-400',
  POST:    'bg-amber-500/15 text-amber-400',
  PUT:     'bg-blue-500/15 text-blue-400',
  DELETE:  'bg-red-500/15 text-red-400',
  PATCH:   'bg-orange-500/15 text-orange-400',
  HEAD:    'bg-purple-500/15 text-purple-400',
  OPTIONS: 'bg-pink-500/15 text-pink-400',
};

interface CategoryTreeProps {
  categories: Category[];
  requests: SavedRequest[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onAddCategory: (parentId: string | null) => void;
  onRenameCategory: (id: string, newName: string) => void;
  onDeleteCategory: (id: string) => void;
  onDuplicateCategory: (id: string) => void;
  onAddRequest: (categoryId: string | null) => void;
  onDeleteRequest: (id: string) => void;
  onMoveRequest: (requestId: string, newCategoryId: string | null) => void;
  onRenameRequest: (id: string, newName: string) => void;
  onMoveCategory: (categoryId: string, newParentId: string | null) => void;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getAncestorIds(catId: string, categories: Category[]): string[] {
  const cat = categories.find(c => c.id === catId);
  if (!cat || !cat.parentId) return [];
  return [cat.parentId, ...getAncestorIds(cat.parentId, categories)];
}

function getExpandedForSelection(
  selection: Selection,
  categories: Category[],
  requests: SavedRequest[],
): Set<string> {
  if (!selection) return new Set();
  if (selection.type === 'category') {
    return new Set(getAncestorIds(selection.id, categories));
  }
  const req = requests.find(r => r.id === selection.id);
  if (!req || !req.categoryId) return new Set();
  return new Set([req.categoryId, ...getAncestorIds(req.categoryId, categories)]);
}

// ─── RequestRow ───────────────────────────────────────────────────────────────

interface RequestRowProps {
  request: SavedRequest;
  depth: number;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onDeleteRequest: (id: string) => void;
  onRenameRequest: (id: string, newName: string) => void;
  renamingRequestId: string | null;
  setRenamingRequestId: (id: string | null) => void;
  dragPhase: DragPhase;
  isDragSource: (id: string) => boolean;
  isPressingSource: (id: string) => boolean;
  handlePointerDown: (e: React.PointerEvent, item: DragItem) => void;
  wasJustDragging: () => boolean;
}

function RequestRow({
  request, depth, selection, onSelect, onDeleteRequest,
  onRenameRequest, renamingRequestId, setRenamingRequestId,
  dragPhase, isDragSource, isPressingSource, handlePointerDown, wasJustDragging,
}: RequestRowProps) {
  const isSelected = selection?.type === 'request' && selection.id === request.id;
  const isRenaming = renamingRequestId === request.id;
  const isSource = (dragPhase === 'dragging' && isDragSource(request.id)) || (dragPhase === 'pressing' && isPressingSource(request.id));

  const [renameValue, setRenameValue] = useState(request.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== request.name) {
      onRenameRequest(request.id, trimmed);
    }
    setRenamingRequestId(null);
  }

  return (
    <div
      className={`group flex items-center gap-1.5 py-1 pr-1 cursor-pointer transition-colors ${
        isSelected ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-800/40'
      } ${isSource && dragPhase === 'dragging' ? 'opacity-50' : ''} ${isSource && dragPhase === 'pressing' ? 'bg-indigo-500/5' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
      onClick={() => {
        if (wasJustDragging()) return;
        if (!isRenaming) onSelect({ type: 'request', id: request.id });
      }}
      onPointerDown={(e) => {
        if (isRenaming) return;
        handlePointerDown(e, {
          type: 'request',
          id: request.id,
          name: request.name,
          method: request.request.method,
        });
      }}
    >
      <FileJson size={13} className="flex-shrink-0 text-slate-600" />

      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setRenameValue(request.name);
              setRenamingRequestId(null);
            }
          }}
          onBlur={commitRename}
          onClick={e => e.stopPropagation()}
          aria-label="リクエスト名を変更"
          className="flex-1 min-w-0 bg-slate-800 border border-indigo-500/60 text-slate-100 text-xs rounded px-1 py-0.5 focus:outline-none"
        />
      ) : (
        <>
          <span
            className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
              METHOD_COLORS[request.request.method] ?? 'text-slate-400'
            }`}
          >
            {request.request.method}
          </span>
          <span
            className="flex-1 min-w-0 text-xs text-slate-400 truncate select-none"
            onDoubleClick={e => {
              e.preventDefault();
              e.stopPropagation();
              setRenameValue(request.name);
              setRenamingRequestId(request.id);
            }}
          >
            {request.name}
          </span>
          <button
            title="リクエストを削除"
            onClick={e => {
              e.stopPropagation();
              onDeleteRequest(request.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
          >
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}

// ─── CategoryNode ─────────────────────────────────────────────────────────────

interface CategoryNodeProps {
  category: Category;
  allCategories: Category[];
  allRequests: SavedRequest[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onAddCategory: (parentId: string | null) => void;
  onRenameCategory: (id: string, newName: string) => void;
  onDeleteCategory: (id: string) => void;
  onDuplicateCategory: (id: string) => void;
  onAddRequest: (categoryId: string | null) => void;
  onDeleteRequest: (id: string) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  onRenameRequest: (id: string, newName: string) => void;
  renamingRequestId: string | null;
  setRenamingRequestId: (id: string | null) => void;
  dragPhase: DragPhase;
  isDragSource: (id: string) => boolean;
  isPressingSource: (id: string) => boolean;
  isActiveDropTarget: (target: DropTarget) => boolean;
  isValidTarget: (categoryId: string) => boolean;
  handlePointerDown: (e: React.PointerEvent, item: DragItem) => void;
  wasJustDragging: () => boolean;
}

function CategoryNode({
  category,
  allCategories,
  allRequests,
  depth,
  expanded,
  onToggle,
  selection,
  onSelect,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onDuplicateCategory,
  onAddRequest,
  onDeleteRequest,
  renamingId,
  setRenamingId,
  onRenameRequest,
  renamingRequestId,
  setRenamingRequestId,
  dragPhase,
  isDragSource,
  isPressingSource,
  isActiveDropTarget,
  isValidTarget,
  handlePointerDown,
  wasJustDragging,
}: CategoryNodeProps) {
  const isExpanded = expanded.has(category.id);
  const isSelected = selection?.type === 'category' && selection.id === category.id;
  const isRenaming = renamingId === category.id;
  const isDragging = dragPhase === 'dragging';
  const isSource = (isDragging && isDragSource(category.id)) || (dragPhase === 'pressing' && isPressingSource(category.id));
  const isTarget = isDragging && isActiveDropTarget({ type: 'category', id: category.id });
  const isValid = isValidTarget(category.id);

  const [renameValue, setRenameValue] = useState(category.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const childCategories = allCategories
    .filter(c => c.parentId === category.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const childRequests = allRequests
    .filter(r => r.categoryId === category.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const totalCount = childCategories.length + childRequests.length;

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== category.name) {
      onRenameCategory(category.id, trimmed);
    }
    setRenamingId(null);
  }

  function handleDelete() {
    const hasChildren = childCategories.length > 0 || childRequests.length > 0;
    if (hasChildren && !confirm(`"${category.name}" とそのすべての内容を削除しますか？`)) return;
    onDeleteCategory(category.id);
  }

  return (
    <div
      data-drop-zone-type="category"
      data-drop-zone-id={category.id}
    >
      {/* Row */}
      <div
        className={`group flex items-center gap-1 py-1 pr-1 cursor-pointer transition-colors ${
          isSelected ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-800/40'
        } ${isSource && dragPhase === 'dragging' ? 'opacity-50' : ''} ${isSource && dragPhase === 'pressing' ? 'bg-indigo-500/5' : ''} ${
          isDragging && isTarget && isValid ? 'ring-1 ring-inset ring-indigo-500 bg-indigo-500/5' : ''
        } ${isDragging && isTarget && !isValid ? 'cursor-not-allowed' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (wasJustDragging()) return;
          if (!isRenaming) onSelect({ type: 'category', id: category.id });
        }}
        onPointerDown={(e) => {
          if (isRenaming) return;
          handlePointerDown(e, { type: 'category', id: category.id, name: category.name });
        }}
      >
        {/* Chevron — only this button toggles expand/collapse */}
        <span
          className="flex-shrink-0 text-slate-600 hover:text-slate-300 transition-colors"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            onToggle(category.id);
          }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <span className="flex-shrink-0 text-amber-500/70">
          {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
        </span>

        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setRenameValue(category.name);
                setRenamingId(null);
              }
            }}
            onBlur={commitRename}
            onClick={e => e.stopPropagation()}
            aria-label="カテゴリー名を変更"
            className="flex-1 min-w-0 bg-slate-800 border border-indigo-500/60 text-slate-100 text-xs rounded px-1 py-0.5 focus:outline-none"
          />
        ) : (
          <>
            <span
            className="flex-1 min-w-0 text-sm text-slate-300 truncate select-none"
            onDoubleClick={e => {
              e.preventDefault();
              e.stopPropagation();
              setRenameValue(category.name);
              setRenamingId(category.id);
            }}
          >
            {category.name}
          </span>

            {totalCount > 0 && (
              <span className="text-[10px] text-slate-600 flex-shrink-0">({totalCount})</span>
            )}

            {/* Action buttons — visible on group hover */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
              <button
                title="サブカテゴリーを追加"
                onClick={e => {
                  e.stopPropagation();
                  onAddCategory(category.id);
                }}
                className="p-0.5 rounded text-slate-600 hover:text-indigo-400 hover:bg-indigo-500/10"
              >
                <Plus size={12} />
              </button>
              <button
                title="リクエストを追加"
                onClick={e => {
                  e.stopPropagation();
                  onAddRequest(category.id);
                }}
                className="p-0.5 rounded text-slate-600 hover:text-indigo-400 hover:bg-indigo-500/10"
              >
                <FileJson size={12} />
              </button>
              <button
                title="名前を変更"
                onClick={e => {
                  e.stopPropagation();
                  setRenameValue(category.name);
                  setRenamingId(category.id);
                }}
                className="p-0.5 rounded text-slate-600 hover:text-indigo-400 hover:bg-indigo-500/10"
              >
                <Edit2 size={12} />
              </button>
              <button
                title="カテゴリーを複製"
                onClick={e => {
                  e.stopPropagation();
                  onDuplicateCategory(category.id);
                }}
                className="p-0.5 rounded text-slate-600 hover:text-indigo-400 hover:bg-indigo-500/10"
              >
                <Copy size={12} />
              </button>
              <button
                title="削除"
                onClick={e => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="p-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Children */}
      {isExpanded && (
        <div>
          {childCategories.map(child => (
            <CategoryNode
              key={child.id}
              category={child}
              allCategories={allCategories}
              allRequests={allRequests}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selection={selection}
              onSelect={onSelect}
              onAddCategory={onAddCategory}
              onRenameCategory={onRenameCategory}
              onDeleteCategory={onDeleteCategory}
              onDuplicateCategory={onDuplicateCategory}
              onAddRequest={onAddRequest}
              onDeleteRequest={onDeleteRequest}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              onRenameRequest={onRenameRequest}
              renamingRequestId={renamingRequestId}
              setRenamingRequestId={setRenamingRequestId}
              dragPhase={dragPhase}
              isDragSource={isDragSource}
              isPressingSource={isPressingSource}
              isActiveDropTarget={isActiveDropTarget}
              isValidTarget={isValidTarget}
              handlePointerDown={handlePointerDown}
              wasJustDragging={wasJustDragging}
            />
          ))}
          {childRequests.map(req => (
            <RequestRow
              key={req.id}
              request={req}
              depth={depth + 1}
              selection={selection}
              onSelect={onSelect}
              onDeleteRequest={onDeleteRequest}
              onRenameRequest={onRenameRequest}
              renamingRequestId={renamingRequestId}
              setRenamingRequestId={setRenamingRequestId}
              dragPhase={dragPhase}
              isDragSource={isDragSource}
              isPressingSource={isPressingSource}
              handlePointerDown={handlePointerDown}
              wasJustDragging={wasJustDragging}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CategoryTree ─────────────────────────────────────────────────────────────

export default function CategoryTree({
  categories,
  requests,
  selection,
  onSelect,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onDuplicateCategory,
  onAddRequest,
  onDeleteRequest,
  onMoveRequest,
  onRenameRequest,
  onMoveCategory,
}: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const persisted = getExpandedCategories();
    const fromSelection = getExpandedForSelection(selection, categories, requests);
    return new Set([...persisted, ...fromSelection]);
  });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingRequestId, setRenamingRequestId] = useState<string | null>(null);

  const expandCategory = useCallback((id: string) => {
    setExpanded(prev => {
      if (prev.has(id)) return prev;
      const next = new Set([...prev, id]);
      saveExpandedCategories(next);
      return next;
    });
  }, []);

  const {
    phase,
    dragItem,
    dropTarget,
    ghostPos,
    handlePointerDown,
    isDragSource,
    isPressingSource,
    isActiveDropTarget,
    isValidTarget,
    wasJustDragging,
  } = useDragAndDrop({
    categories,
    onMoveCategory: async (categoryId, newParentId) => {
      await onMoveCategory(categoryId, newParentId);
    },
    onMoveRequest: async (requestId, newCategoryId) => {
      await onMoveRequest(requestId, newCategoryId);
    },
    onExpandCategory: expandCategory,
  });

  useEffect(() => {
    if (phase === 'dragging') {
      document.body.style.cursor = dropTarget ? 'grabbing' : 'not-allowed';
      document.body.style.userSelect = 'none';
    } else if (phase === 'pressing') {
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [phase, dropTarget]);

  // Auto-expand ancestors when the selection is changed externally
  useEffect(() => {
    const toExpand = getExpandedForSelection(selection, categories, requests);
    if (toExpand.size > 0) {
      setExpanded(prev => {
        const next = new Set([...prev, ...toExpand]);
        saveExpandedCategories(next);
        return next;
      });
    }
  }, [selection, categories, requests]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveExpandedCategories(next);
      return next;
    });
  }, []);

  const rootCategories = categories
    .filter(c => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const uncategorizedRequests = requests
    .filter(r => r.categoryId === null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const isEmpty = categories.length === 0 && requests.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Toolbar */}
      <div className="border-b border-slate-800/80 px-2 py-2 flex gap-1 flex-shrink-0">
        <button
          onClick={() => onAddCategory(null)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 rounded-md"
        >
          <Plus size={12} />
          新しいカテゴリー
        </button>
        <button
          onClick={() => onAddRequest(null)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 rounded-md"
        >
          <Plus size={12} />
          新しいリクエスト
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {rootCategories.map(cat => (
          <CategoryNode
            key={cat.id}
            category={cat}
            allCategories={categories}
            allRequests={requests}
            depth={0}
            expanded={expanded}
            onToggle={toggleExpanded}
            selection={selection}
            onSelect={onSelect}
            onAddCategory={onAddCategory}
            onRenameCategory={onRenameCategory}
            onDeleteCategory={onDeleteCategory}
            onDuplicateCategory={onDuplicateCategory}
            onAddRequest={onAddRequest}
            onDeleteRequest={onDeleteRequest}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            onRenameRequest={onRenameRequest}
            renamingRequestId={renamingRequestId}
            setRenamingRequestId={setRenamingRequestId}
            dragPhase={phase}
            isDragSource={isDragSource}
            isPressingSource={isPressingSource}
            isActiveDropTarget={isActiveDropTarget}
            isValidTarget={isValidTarget}
            handlePointerDown={handlePointerDown}
            wasJustDragging={wasJustDragging}
          />
        ))}

        {uncategorizedRequests.length > 0 && (
          <div className={rootCategories.length > 0 ? 'mt-2' : ''}>
            <div className="text-[10px] uppercase tracking-widest text-slate-700 px-3 py-1.5 select-none">
              未分類
            </div>
            {uncategorizedRequests.map(req => (
              <RequestRow
                key={req.id}
                request={req}
                depth={0}
                selection={selection}
                onSelect={onSelect}
                onDeleteRequest={onDeleteRequest}
                onRenameRequest={onRenameRequest}
                renamingRequestId={renamingRequestId}
                setRenamingRequestId={setRenamingRequestId}
                dragPhase={phase}
                isDragSource={isDragSource}
                isPressingSource={isPressingSource}
                handlePointerDown={handlePointerDown}
                wasJustDragging={wasJustDragging}
              />
            ))}
          </div>
        )}

        {isEmpty && (
          <p className="px-4 py-6 text-xs text-slate-700 text-center">
            No categories or requests yet.
            <br />
            Use the buttons above to get started.
          </p>
        )}

        {/* Root drop zone */}
        <div
          data-drop-zone-type="root"
          className={`mx-2 my-2 p-2 border rounded text-xs text-center transition-colors select-none ${
            phase === 'dragging'
              ? isActiveDropTarget({ type: 'root' })
                ? 'border-solid border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-dashed border-indigo-500/30 text-slate-600'
              : 'border-dashed border-transparent text-transparent pointer-events-none'
          }`}
        >
          ルートへ移動
        </div>
      </div>

      {/* Ghost capsule (portal to document.body) */}
      {phase === 'dragging' && dragItem && typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              left: ghostPos.x + 14,
              top: ghostPos.y + 14,
            }}
            className="fixed pointer-events-none z-[9999] flex items-center gap-1.5 bg-slate-800 border border-indigo-500/40 rounded-lg px-2.5 py-1 shadow-xl shadow-black/40"
          >
            {dragItem.type === 'category' ? (
              <Folder size={12} className="flex-shrink-0 text-amber-500/70" />
            ) : (
              <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[dragItem.method ?? 'GET'] ?? ''}`}>
                {dragItem.method}
              </span>
            )}
            <span className="text-xs text-slate-200 max-w-[8rem] truncate">{dragItem.name}</span>
          </div>,
          document.body,
        )
      }
    </div>
  );
}
