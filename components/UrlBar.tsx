'use client';

import { Send, Loader2 } from 'lucide-react';
import { HttpMethod } from '@/lib/types';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  DELETE: 'text-red-400',
  PATCH: 'text-orange-400',
  HEAD: 'text-purple-400',
  OPTIONS: 'text-pink-400',
};

interface UrlBarProps {
  method: HttpMethod;
  url: string;
  loading: boolean;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
}

export default function UrlBar({ method, url, loading, onMethodChange, onUrlChange, onSend }: UrlBarProps) {
  return (
    <div className="flex items-center gap-2 p-3 bg-gray-900 border-b border-gray-700">
      <select
        value={method}
        onChange={e => onMethodChange(e.target.value as HttpMethod)}
        className={`bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-semibold focus:outline-none focus:border-blue-500 ${METHOD_COLORS[method]}`}
      >
        {METHODS.map(m => (
          <option key={m} value={m} className="text-gray-200">
            {m}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={url}
        onChange={e => onUrlChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !loading && onSend()}
        placeholder="Enter request URL (e.g. https://api.example.com/users)"
        className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      <button
        onClick={onSend}
        disabled={loading || !url.trim()}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {loading ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
}
