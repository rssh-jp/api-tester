'use client';
import { Send, Loader2 } from 'lucide-react';
import { HttpMethod } from '@/lib/types';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const METHOD_BG: Record<HttpMethod, string> = {
  GET:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  POST:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PUT:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  DELETE:  'bg-red-500/15 text-red-400 border-red-500/30',
  PATCH:   'bg-orange-500/15 text-orange-400 border-orange-500/30',
  HEAD:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
  OPTIONS: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
};

interface UrlBarProps {
  method: HttpMethod; url: string; loading: boolean;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
}

export default function UrlBar({ method, url, loading, onMethodChange, onUrlChange, onSend }: UrlBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#0d1117] border-b border-slate-800/80">
      <select
        value={method}
        onChange={e => onMethodChange(e.target.value as HttpMethod)}
        className={`border rounded-lg px-3 py-2 text-xs font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer appearance-none min-w-[80px] text-center ${METHOD_BG[method]} bg-transparent`}
      >
        {METHODS.map(m => (
          <option key={m} value={m} className="bg-[#0d1117] text-slate-200 font-medium">{m}</option>
        ))}
      </select>
      <div className="flex-1 relative">
        <input
          type="text"
          value={url}
          onChange={e => onUrlChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && onSend()}
          placeholder="https://api.example.com/endpoint"
          className="w-full bg-[#161b27] border border-slate-700/60 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 font-mono"
        />
      </div>
      <button
        onClick={onSend}
        disabled={loading || !url.trim()}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/30 active:scale-95"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {loading ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
}
