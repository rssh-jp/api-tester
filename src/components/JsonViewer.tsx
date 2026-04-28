'use client';

import { useState } from 'react';

interface JsonViewerProps {
  content: string;
}

function syntaxHighlight(json: string): string {
  json = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-yellow-300'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-blue-300'; // key
        } else {
          cls = 'text-green-300'; // string
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-300'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-red-300'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export default function JsonViewer({ content }: JsonViewerProps) {
  const [raw, setRaw] = useState(false);

  let prettyContent = content;
  let isJson = false;

  try {
    const parsed = JSON.parse(content);
    prettyContent = JSON.stringify(parsed, null, 2);
    isJson = true;
  } catch {
    // not JSON, show raw
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {isJson && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800">
          <div className="flex bg-slate-800/50 rounded-lg p-0.5">
            <button
              onClick={() => setRaw(false)}
              className={`text-xs px-2.5 py-1 rounded-md ${!raw ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Pretty
            </button>
            <button
              onClick={() => setRaw(true)}
              className={`text-xs px-2.5 py-1 rounded-md ${raw ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Raw
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {isJson && !raw ? (
          <pre
            className="text-sm leading-relaxed font-mono px-4 py-4 whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: syntaxHighlight(prettyContent) }}
          />
        ) : (
          <pre className="text-sm font-mono text-slate-300 leading-relaxed px-4 py-4 whitespace-pre-wrap break-words">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
