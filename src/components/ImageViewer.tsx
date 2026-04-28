'use client';
import { useState, useEffect } from 'react';

interface ImageViewerProps {
  body: string;
  contentType: string;
  isBinary?: boolean;
}

export default function ImageViewer({ body, contentType, isBinary }: ImageViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobError, setBlobError] = useState(false);

  useEffect(() => {
    if (isBinary || !body) {
      setBlobUrl(null);
      setBlobError(false);
      return;
    }
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([body], { type: contentType }));
      setBlobUrl(url);
      setBlobError(false);
    } catch {
      setBlobError(true);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [body, contentType, isBinary]);

  if (isBinary || !body) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">🖼️</div>
        <p className="text-sm font-medium text-slate-300">画像レスポンス</p>
        <p className="text-xs text-slate-500 font-mono">{contentType}</p>
        <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
          バイナリ形式の画像データはプレビューできません。
        </p>
      </div>
    );
  }

  if (blobError || !blobUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <p className="text-sm text-red-400">画像の表示に失敗しました</p>
        <p className="text-xs text-slate-500 font-mono">{contentType}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
      <img
        src={blobUrl}
        alt="Response image"
        className="max-w-full max-h-full object-contain rounded-lg"
      />
      <p className="text-xs text-slate-500 font-mono">{contentType}</p>
    </div>
  );
}
