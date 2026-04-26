# DESIGN-レスポンスコンテンツタイプ別表示: レスポンスボディの Content-Type 別自動表示切り替え

> **ステータス**: 草稿  
> **作成日**: 2026-04-26  
> **最終更新**: 2026-04-26

---

## 1. 概要

- **対応仕様書**: [`SPEC-レスポンスコンテンツタイプ別表示.md`](../specs/SPEC-レスポンスコンテンツタイプ別表示.md)
- **設計方針**:
  - `ResponsePanel.tsx` の Body タブに Content-Type 判定関数を追加し、適切なビューアコンポーネントに委譲する
  - `HtmlViewer`・`XmlViewer`・`ImageViewer` を新規作成する
  - 既存の `JsonViewer` はそのまま流用する（変更なし）
  - `lib/types.ts`・`lib/storage.ts` は変更しない

---

## 2. 変更ファイル一覧

### 新規作成

| ファイル | 役割 |
|---------|------|
| `components/HtmlViewer.tsx` | HTML の iframe プレビュー + Source 表示切り替え |
| `components/XmlViewer.tsx` | XML のシンタックスハイライト + Pretty/Raw 切り替え |
| `components/ImageViewer.tsx` | 画像の `<img>` 表示 |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `components/ResponsePanel.tsx` | Body タブに `detectViewerType` 判定を追加し、各ビューアへ委譲 |

### 変更なし

| ファイル | 理由 |
|---------|------|
| `components/JsonViewer.tsx` | 既存実装をそのまま使用 |
| `lib/types.ts` | `ResponseState.contentType` / `isBinary` はすでに定義済み |
| `lib/storage.ts` | データ構造変更なし |
| `app/api/proxy/route.ts` | バイナリ判定・`contentType` 返却はすでに実装済み。ただし `isBinary: true` の場合 `body` は空文字 |

---

## 3. コンポーネント設計

### 3.1 コンポーネント構成（Body タブ内）

```
ResponsePanel (Body タブ)
├── detectViewerType(response) → ViewerType
├── ViewerType === 'json'   → JsonViewer (既存)
├── ViewerType === 'html'   → HtmlViewer (新規)
├── ViewerType === 'xml'    → XmlViewer (新規)
├── ViewerType === 'image'  → ImageViewer (新規)
├── ViewerType === 'text'   → PlainTextViewer (インライン実装)
└── ViewerType === 'binary' → 既存バイナリ警告 UI
```

### 3.2 新規コンポーネント

---

#### `HtmlViewer` (`components/HtmlViewer.tsx`)

- **役割**: HTML レスポンスボディを iframe プレビューまたはソース表示で切り替える
- **種別**: Client Component（`'use client'` 必要）
- **Props**:

```typescript
type HtmlViewerProps = {
  content: string;
};
```

- **内部状態**:

```typescript
const [mode, setMode] = useState<'preview' | 'source'>('preview');
const [blobUrl, setBlobUrl] = useState<string | null>(null);
```

- **主要ロジック**:
  1. `useEffect` で `content` が変化するたびに `URL.createObjectURL(new Blob([content], { type: 'text/html' }))` で Blob URL を生成する
  2. クリーンアップ関数で `URL.revokeObjectURL(blobUrl)` を呼ぶ（メモリリーク防止）
  3. `mode === 'preview'` のとき、`<iframe src={blobUrl} sandbox="allow-same-origin" />` で表示する
  4. `mode === 'source'` のとき、HTML ソースをシンタックスハイライトで表示する（後述の `syntaxHighlightXml` を流用）
  5. Blob URL 生成に失敗した場合は `mode` を強制的に `'source'` に切り替える

- **セキュリティ要件**:
  - `sandbox` 属性は `"allow-same-origin"` のみ。`allow-scripts`・`allow-forms`・`allow-top-navigation` は禁止
  - コンテンツは Blob URL 経由で渡す（`srcdoc` は使用しない）

- **実装スケルトン**:

```typescript
'use client';

import { useState, useEffect } from 'react';

type HtmlViewerProps = {
  content: string;
};

export default function HtmlViewer({ content }: HtmlViewerProps) {
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
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

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* タブバー */}
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
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-hidden">
        {mode === 'preview' && blobUrl ? (
          <iframe
            src={blobUrl}
            sandbox="allow-same-origin"
            className="w-full h-full border-0 bg-white"
            title="HTML Preview"
          />
        ) : (
          <pre
            className="text-sm leading-relaxed font-mono px-4 py-4 whitespace-pre-wrap break-words overflow-auto h-full"
            dangerouslySetInnerHTML={{ __html: syntaxHighlightHtml(content) }}
          />
        )}
      </div>
    </div>
  );
}
```

- **`syntaxHighlightHtml` の実装方針**:
  - `XmlViewer` の `syntaxHighlightXml` と同じ実装を使用する（HTML は XML として同様にハイライト可能）
  - 必ず先に HTML エスケープ（`&` `<` `>` の置換）を行ってからハイライト用 `<span>` を付与する

---

#### `XmlViewer` (`components/XmlViewer.tsx`)

- **役割**: XML レスポンスボディをシンタックスハイライト（Pretty）またはプレーンテキスト（Raw）で切り替え表示する
- **種別**: Client Component（`'use client'` 必要）
- **Props**:

```typescript
type XmlViewerProps = {
  content: string;
};
```

- **内部状態**:

```typescript
const [raw, setRaw] = useState(false);
```

- **主要ロジック**:
  1. `DOMParser` で XML パースを試みる（`text/xml`）
  2. パース成功かつ `<parsererror>` が含まれなければ `canPretty = true`
  3. パース成功の場合、`XMLSerializer` で `prettyPrint(doc)` に整形する
  4. `canPretty === false` の場合は Pretty ボタンをグレーアウトし、Raw のみ有効とする

- **`prettyPrint` の実装方針**:
  - `XMLSerializer().serializeToString(doc)` は整形なしで出力するため、自前でインデント処理を行う
  - 簡易実装: 正規表現で `>` の後に改行を挿入し、タグのネストレベルをカウントしてスペース 2 個/レベルのインデントを付与する
  - XMLSerializer の代替として、再帰的 DOM 走査でインデント付きシリアライズを行うこともできる（推奨）

- **`syntaxHighlightXml` の実装方針**:
  - 入力文字列を先に HTML エスケープ（`& → &amp;`、`< → &lt;`、`> → &gt;`）する
  - その後、以下のパターンに `<span class="...">` を適用する（エスケープ済み文字列に対して正規表現マッチ）:

  | パターン | 色 |
  |---------|-----|
  | `&lt;!--...--&gt;` コメント | `text-slate-500` |
  | `&lt;?...?&gt;` 処理命令 | `text-purple-300` |
  | `&lt;/tagname&gt;` 閉じタグ | `text-blue-300` |
  | `&lt;tagname` 開きタグ名 | `text-blue-300` |
  | `attrName=` 属性名 | `text-yellow-300` |
  | `"value"` 属性値 | `text-green-300` |
  | `&gt;` `&lt;` 山括弧 | `text-slate-400` |

- **実装スケルトン**:

```typescript
'use client';

import { useState } from 'react';

type XmlViewerProps = {
  content: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prettyPrintXml(xml: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    return serializeNode(doc.documentElement, 0);
  } catch {
    return null;
  }
}

function serializeNode(node: Node, depth: number): string {
  const indent = '  '.repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').trim();
    return text ? `${indent}${escapeHtml(text)}\n` : '';
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return `${indent}&lt;!--${escapeHtml(node.textContent ?? '')}--&gt;\n`;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
  const tag = el.tagName;
  const attrs = Array.from(el.attributes)
    .map((a) => ` ${escapeHtml(a.name)}="${escapeHtml(a.value)}"`)
    .join('');

  const children = Array.from(el.childNodes)
    .map((c) => serializeNode(c, depth + 1))
    .join('');

  if (!children.trim()) {
    return `${indent}&lt;${tag}${attrs} /&gt;\n`;
  }
  return `${indent}&lt;${tag}${attrs}&gt;\n${children}${indent}&lt;/${tag}&gt;\n`;
}

function syntaxHighlightXml(escaped: string): string {
  // escaped は escapeHtml 済みの文字列を受け取る
  return escaped
    // コメント
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-slate-500">$1</span>')
    // 処理命令
    .replace(/(&lt;\?[\s\S]*?\?&gt;)/g, '<span class="text-purple-300">$1</span>')
    // 閉じタグ
    .replace(/(&lt;\/[\w:-]+&gt;)/g, '<span class="text-blue-300">$1</span>')
    // 開きタグ名（属性より前）
    .replace(/(&lt;[\w:-]+)/g, '<span class="text-blue-300">$1</span>')
    // 属性値
    .replace(/(&quot;[^&]*&quot;)/g, '<span class="text-green-300">$1</span>')
    // 山括弧
    .replace(/(&gt;|&lt;)/g, '<span class="text-slate-400">$1</span>');
}

export default function XmlViewer({ content }: XmlViewerProps) {
  const [raw, setRaw] = useState(false);

  const prettyXml = prettyPrintXml(content);
  const canPretty = prettyXml !== null;

  const displayContent = !raw && canPretty ? prettyXml! : escapeHtml(content);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800">
        <div className="flex bg-slate-800/50 rounded-lg p-0.5">
          <button
            onClick={() => setRaw(false)}
            disabled={!canPretty}
            aria-pressed={!raw}
            className={`text-xs px-2.5 py-1 rounded-md ${
              !raw && canPretty
                ? 'bg-slate-700 text-slate-100 shadow-sm'
                : canPretty
                ? 'text-slate-500 hover:text-slate-300'
                : 'text-slate-700 cursor-not-allowed'
            }`}
          >
            Pretty
          </button>
          <button
            onClick={() => setRaw(true)}
            aria-pressed={raw}
            className={`text-xs px-2.5 py-1 rounded-md ${
              raw ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Raw
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <pre
          className="text-sm leading-relaxed font-mono px-4 py-4 whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: syntaxHighlightXml(displayContent) }}
        />
      </div>
    </div>
  );
}
```

---

#### `ImageViewer` (`components/ImageViewer.tsx`)

- **役割**: `image/*` の Content-Type を持つレスポンスを `<img>` タグで表示する
- **種別**: Client Component（`'use client'` 必要）
- **Props**:

```typescript
type ImageViewerProps = {
  body: string;        // レスポンスボディ（isBinary の場合は空文字）
  contentType: string; // "image/png", "image/svg+xml" 等
  isBinary?: boolean;  // true のとき body は空
  size: number;        // バイト数（ステータスバーに表示）
};
```

- **主要ロジック**:

  | 条件 | `src` の組み立て |
  |------|----------------|
  | `isBinary === true` かつ `body` が空 | 表示不可 → 「画像データを取得できませんでした」メッセージ |
  | `isBinary === true` かつ `body` が非空（将来対応） | `data:${contentType};base64,${body}` |
  | `isBinary !== true`（SVG 等のテキスト画像） | `data:${contentType};charset=utf-8,${encodeURIComponent(body)}` |

- **実装スケルトン**:

```typescript
'use client';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

type ImageViewerProps = {
  body: string;
  contentType: string;
  isBinary?: boolean;
  size: number;
};

export default function ImageViewer({ body, contentType, isBinary, size }: ImageViewerProps) {
  // isBinary の場合 body は空文字（プロキシの現行実装）
  const canDisplay = !isBinary || body.length > 0;

  const src = canDisplay
    ? isBinary
      ? `data:${contentType};base64,${body}`
      : `data:${contentType};charset=utf-8,${encodeURIComponent(body)}`
    : null;

  if (!src) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">🖼️</div>
        <p className="text-sm font-medium text-slate-300">画像データを取得できませんでした</p>
        <p className="text-xs text-slate-500 font-mono">{contentType}</p>
        <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
          バイナリレスポンスのため、現在のプロキシ実装ではボディが取得できません。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={contentType}
        className="max-w-full max-h-[70%] object-contain rounded-lg border border-slate-800"
      />
      <p className="text-xs text-slate-500 font-mono">
        {contentType} • {size > 0 ? formatSize(size) : '?'}
      </p>
    </div>
  );
}
```

---

### 3.3 変更するコンポーネント

#### `ResponsePanel` (`components/ResponsePanel.tsx`)

- **変更内容**:
  1. `detectViewerType` 関数を追加する
  2. Body タブのレンダリングを `detectViewerType` の返り値で分岐する
  3. 既存のバイナリ警告 UI は `detectViewerType` が `'binary'` を返した場合に使用する（現在のインラインコードを維持）

---

## 4. `detectViewerType` 関数の設計

### シグネチャ

```typescript
type ViewerType = 'html' | 'json' | 'xml' | 'image' | 'text' | 'binary';

function detectViewerType(response: ResponseState): ViewerType
```

### 判定ロジック（先勝ち）

```typescript
function detectViewerType(response: ResponseState): ViewerType {
  const ct = (response.contentType ?? '').toLowerCase().split(';')[0].trim();

  // 1. バイナリ判定
  if (response.isBinary) {
    return ct.startsWith('image/') ? 'image' : 'binary';
  }

  // 2. ボディが空
  if (!response.body) return 'text';

  // 3. Content-Type による分岐
  if (ct.startsWith('image/')) return 'image';
  if (ct === 'text/html') return 'html';
  if (ct === 'application/json' || ct === 'text/json') return 'json';
  if (ct === 'text/xml' || ct === 'application/xml' || ct.endsWith('+xml')) return 'xml';
  if (ct.startsWith('text/') || ct === '') {
    // contentType 未定義 or テキスト系: JSON パース試行
    try {
      JSON.parse(response.body);
      return 'json';
    } catch {
      return 'text';
    }
  }

  return 'text';
}
```

### 注意点

- `contentType` は `"text/html; charset=utf-8"` のようにセミコロン以降にパラメータを含む場合があるため、`split(';')[0].trim()` で MIME タイプ部分のみを取り出す
- `ct === ''` は `contentType` が `undefined` または空文字の場合を処理する

---

## 5. Body タブのレンダリング分岐

`ResponsePanel.tsx` の Body タブ部分を以下のように変更する:

```typescript
// 変更前
{activeTab === 'Body' && (
  response.isBinary
    ? <バイナリ警告UI />
    : <JsonViewer content={response.body} />
)}

// 変更後
{activeTab === 'Body' && (() => {
  if (!response.body && !response.isBinary) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        レスポンスボディは空です
      </div>
    );
  }

  const viewerType = detectViewerType(response);

  switch (viewerType) {
    case 'html':
      return <HtmlViewer content={response.body} />;
    case 'json':
      return <JsonViewer content={response.body} />;
    case 'xml':
      return <XmlViewer content={response.body} />;
    case 'image':
      return (
        <ImageViewer
          body={response.body}
          contentType={response.contentType ?? ''}
          isBinary={response.isBinary}
          size={response.size}
        />
      );
    case 'binary':
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
          {/* 既存バイナリ警告 UI をそのまま移植 */}
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">🖼️</div>
          <p className="text-sm font-medium text-slate-300">バイナリ / 画像レスポンス</p>
          <p className="text-xs text-slate-500 font-mono">{response.contentType || 'unknown content-type'}</p>
          <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
            このレスポンスはテキストとして表示できません。
            {response.redirected ? ' リクエストがリダイレクトされた先にバイナリファイルがあります。URL を確認してください。' : ''}
          </p>
        </div>
      );
    case 'text':
    default:
      return (
        <div className="flex-1 overflow-auto h-full">
          <pre className="text-sm font-mono text-slate-300 leading-relaxed px-4 py-4 whitespace-pre-wrap break-words">
            {response.body || '（空のレスポンス）'}
          </pre>
        </div>
      );
  }
})()}
```

> **注**: `Body` タブのコンテンツは既存の `<div className="flex-1 overflow-hidden">` 内に収まっているため、高さのフレックスレイアウトはそのまま維持される。

---

## 6. ダークテーマ対応方針

| コンポーネント | 背景 | テキスト | ボーダー |
|--------------|------|---------|---------|
| `HtmlViewer`（Source モード） | `bg-[#0d1117]` | `text-slate-300` | `border-slate-800` |
| `HtmlViewer`（iframe） | `bg-white`（iframe 内は外部 HTML に依存） | — | — |
| `XmlViewer` | `bg-[#0d1117]` | `text-slate-300` | `border-slate-800` |
| `ImageViewer` | `bg-[#0d1117]` | `text-slate-300` / `text-slate-500` | `border-slate-800` |
| PlainTextViewer（インライン） | `bg-[#0d1117]` | `text-slate-300` | — |
| タブボタン（アクティブ） | `bg-slate-700` | `text-slate-100` | — |
| タブボタン（非アクティブ） | — | `text-slate-500` | — |
| タブボタン（無効） | — | `text-slate-700` | — |

---

## 7. 実装手順

依存関係を考慮した推奨順序:

1. **`components/ImageViewer.tsx` を新規作成する**
   - 外部依存なし
2. **`components/XmlViewer.tsx` を新規作成する**
   - 外部依存なし（`DOMParser` / `XMLSerializer` は Web API）
3. **`components/HtmlViewer.tsx` を新規作成する**
   - `syntaxHighlightXml` の実装パターンを `XmlViewer` から流用する
4. **`components/ResponsePanel.tsx` を修正する**
   - `detectViewerType` 関数を追加する
   - `HtmlViewer` / `XmlViewer` / `ImageViewer` を import する
   - Body タブのレンダリング分岐を置き換える
   - 既存のバイナリ警告 UI インラインコードを `case 'binary':` ブランチに移植する

---

## 8. 影響を受ける既存機能

| 機能名 | 影響内容 | 対応方針 |
|-------|---------|---------|
| レスポンス履歴（HistoryItem） | `contentType` / `isBinary` フィールドが既存データに存在しない場合がある | `detectViewerType` 内で `response.contentType ?? ''` とすることで `undefined` を安全に扱う |
| バイナリ/画像警告 UI | 既存の JSX を `case 'binary':` に移植 | テキスト・クラス・条件分岐はそのまま維持 |
| `JsonViewer` の Pretty/Raw | 変更なし | `case 'json':` でそのまま呼び出す |

---

## 9. 懸念事項・リスク

| 懸念事項 | 詳細 | 対処方針 |
|---------|------|---------|
| バイナリ画像表示不可 | プロキシが `isBinary: true` のとき `body` を空文字として返す。`ImageViewer` は表示不可メッセージを出す | AC7 の受け入れ条件は SVG（テキスト）等、`isBinary: false` の画像でのみ満たせる。バイナリ画像対応は別仕様として分離する |
| XML Pretty 整形のブロック | 1 MB 超の XML は `DOMParser` + DOM 走査がメインスレッドをブロックする可能性がある | 初期実装はそのまま。1 MB 超の場合は `canPretty = false` にフォールバックする Guard を追加することを検討する |
| `XmlViewer` の `syntaxHighlightXml` 正規表現の誤マッチ | `serializeNode` で生成した文字列は escapeHtml 済みのため、生の `<` や `>` が混入しないことを前提とする | `serializeNode` 内での `escapeHtml` 適用を必ず維持する |
| `HtmlViewer` の iframe 高さ | `iframe` がフレックスコンテナ内で `h-full` にならない場合がある | 親の `div.flex-1.overflow-hidden` に `flex flex-col` を付与し、`iframe` に `flex-1` を使用する |
