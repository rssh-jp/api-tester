'use client';
import { useState, useEffect } from 'react';

interface XmlViewerProps {
  content: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prettyPrintXml(xml: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('parse error');

    function serialize(node: Node, indent: number): string {
      const pad = '  '.repeat(indent);
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? '').trim();
        return text ? pad + escapeHtml(text) + '\n' : '';
      }
      if (node.nodeType === Node.COMMENT_NODE) {
        return `${pad}&lt;!--${escapeHtml(node.textContent ?? '')}--&gt;\n`;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const el = node as Element;
      const tag = escapeHtml(el.tagName);
      const attrs = Array.from(el.attributes)
        .map(a => ` <span class="text-yellow-300">${escapeHtml(a.name)}</span>=<span class="text-green-300">"${escapeHtml(a.value)}"</span>`)
        .join('');

      const children = Array.from(el.childNodes);
      const childText = children.map(c => serialize(c, indent + 1)).join('');

      if (!childText.trim()) {
        return `${pad}<span class="text-blue-300">&lt;${tag}${attrs} /&gt;</span>\n`;
      }
      return `${pad}<span class="text-blue-300">&lt;${tag}${attrs}&gt;</span>\n${childText}${pad}<span class="text-blue-300">&lt;/${tag}&gt;</span>\n`;
    }

    return Array.from(doc.childNodes).map(n => serialize(n, 0)).join('');
  } catch {
    return null;
  }
}

export default function XmlViewer({ content }: XmlViewerProps) {
  const prettyResult = prettyPrintXml(content);
  const canPretty = prettyResult !== null;
  const [raw, setRaw] = useState(!canPretty);

  useEffect(() => {
    if (!canPretty) setRaw(true);
  }, [canPretty]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800">
        <div className="flex bg-slate-800/50 rounded-lg p-0.5">
          {[false, true].map((isRaw) => (
            <button
              key={String(isRaw)}
              onClick={() => { if (!isRaw && !canPretty) return; setRaw(isRaw); }}
              aria-pressed={raw === isRaw}
              disabled={!isRaw && !canPretty}
              className={`text-xs px-2.5 py-1 rounded-md ${
                raw === isRaw
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : !isRaw && !canPretty
                    ? 'text-slate-700 cursor-not-allowed'
                    : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {isRaw ? 'Raw' : 'Pretty'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {raw || !canPretty ? (
          <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-all">
            {content}
          </pre>
        ) : (
          <pre
            className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all"
            dangerouslySetInnerHTML={{ __html: prettyResult }}
          />
        )}
      </div>
    </div>
  );
}
