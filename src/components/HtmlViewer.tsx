'use client';
import { useState, useEffect } from 'react';

interface HtmlViewerProps {
  content: string;
}

export default function HtmlViewer({ content }: HtmlViewerProps) {
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [jsEnabled, setJsEnabled] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([content], { type: 'text/html' }));
      setBlobUrl(url);
    } catch {
      setMode('source');
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [content]);

  const sandboxAttr = jsEnabled ? 'allow-scripts' : 'allow-same-origin';

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800">
        <div className="flex bg-slate-800/50 rounded-lg p-0.5">
          {(['preview', 'source'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`text-xs px-2.5 py-1 rounded-md capitalize ${
                mode === m
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {m === 'preview' ? 'Preview' : 'Source'}
            </button>
          ))}
        </div>

        {mode === 'preview' && (
          <button
            onClick={() => setJsEnabled(v => !v)}
            aria-pressed={jsEnabled}
            title={jsEnabled ? 'JavaScript enabled (click to disable)' : 'JavaScript disabled (click to enable)'}
            className={`ml-auto flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
              jsEnabled
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-slate-800/50 text-slate-600 border-slate-700/50 hover:text-slate-400'
            }`}
          >
            <span>⚡</span>
            <span>JS {jsEnabled ? 'ON' : 'OFF'}</span>
          </button>
        )}
      </div>

      {mode === 'preview' && blobUrl ? (
        <iframe
          key={`${blobUrl}-${jsEnabled}`}
          src={blobUrl}
          sandbox={sandboxAttr}
          className="flex-1 w-full border-0 bg-white"
          title="HTML Preview"
        />
      ) : (
        <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-300 bg-[#0d1117] leading-relaxed whitespace-pre-wrap break-all">
          {content}
        </pre>
      )}
    </div>
  );
}
