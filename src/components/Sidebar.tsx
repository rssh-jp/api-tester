'use client';

import { useState } from 'react';
import { Clock, Bookmark, ChevronDown, ChevronRight, Trash2, Save } from 'lucide-react';
import { HistoryItem, SavedRequest, RequestState } from '@/lib/types';

interface SidebarProps {
  history: HistoryItem[];
  saved: SavedRequest[];
  onLoadRequest: (request: RequestState) => void;
  onSaveCurrentRequest: () => void;
  onDeleteSaved: (id: string) => void;
  onClearHistory: () => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  DELETE: 'text-red-400',
  PATCH: 'text-orange-400',
  HEAD: 'text-purple-400',
  OPTIONS: 'text-pink-400',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export default function Sidebar({ history, saved, onLoadRequest, onSaveCurrentRequest, onDeleteSaved, onClearHistory }: SidebarProps) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [savedOpen, setSavedOpen] = useState(true);

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-700 overflow-y-auto">
      {/* Saved */}
      <div className="border-b border-gray-700">
        <button
          onClick={() => setSavedOpen(o => !o)}
          className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Bookmark size={14} />
            Saved ({saved.length})
          </div>
          {savedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {savedOpen && (
          <div className="pb-2">
            <button
              onClick={onSaveCurrentRequest}
              className="flex items-center gap-2 w-full px-4 py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-800 transition-colors"
            >
              <Save size={12} />
              Save current request
            </button>
            {saved.map(s => (
              <div
                key={s.id}
                className="flex items-center group px-4 py-2 hover:bg-gray-800 cursor-pointer"
                onClick={() => onLoadRequest(s.request)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-200 truncate">{s.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-xs font-semibold ${METHOD_COLORS[s.request.method] || 'text-gray-400'}`}>
                      {s.request.method}
                    </span>
                    <span className="text-xs text-gray-500 truncate">{s.request.url}</span>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onDeleteSaved(s.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {saved.length === 0 && (
              <p className="px-4 py-2 text-xs text-gray-600">No saved requests</p>
            )}
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Clock size={14} />
            History ({history.length})
          </div>
          {historyOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {historyOpen && (
          <div className="pb-2">
            {history.length > 0 && (
              <button
                onClick={onClearHistory}
                className="flex items-center gap-2 w-full px-4 py-2 text-xs text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
              >
                <Trash2 size={12} />
                Clear history
              </button>
            )}
            {history.map(item => (
              <div
                key={item.id}
                className="flex items-center px-4 py-2 hover:bg-gray-800 cursor-pointer"
                onClick={() => onLoadRequest(item.request)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-semibold ${METHOD_COLORS[item.request.method] || 'text-gray-400'}`}>
                      {item.request.method}
                    </span>
                    {item.response && (
                      <span className={`text-xs px-1 rounded ${
                        item.response.status >= 200 && item.response.status < 300
                          ? 'bg-green-900 text-green-300'
                          : item.response.status >= 400
                          ? 'bg-red-900 text-red-300'
                          : 'bg-orange-900 text-orange-300'
                      }`}>
                        {item.response.status}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">{item.request.url}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{formatTime(item.timestamp)}</div>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <p className="px-4 py-2 text-xs text-gray-600">No history yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
