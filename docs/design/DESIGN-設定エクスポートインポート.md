# DESIGN-設定エクスポートインポート: Settings Export / Import

## 1. 概要

- **対応仕様書**: `docs/specs/SPEC-設定エクスポートインポート.md`
- **設計方針**:
  - 新規コンポーネントは作成しない。既存の `ApiTester.tsx` へ機能を追加する。
  - `lib/types.ts` に `ExportData` インターフェースを追加する。
  - `lib/storage.ts` に `exportData()` / `importData()` / `validateExportData()` を追加する。
  - ダウンロードは `<a download>` プログラム的クリック、ファイル選択は hidden `<input type="file">` + `useRef` で実現する。
  - 確認・エラーダイアログはブラウザ標準の `window.confirm()` / `window.alert()` を使用する（既存コードの方針と統一）。
  - 成功フィードバックはヘッダー直下に一時表示する帯メッセージ（state + `setTimeout`）で実装する。

---

## 2. 変更ファイル一覧

| ファイル | 変更種別 | 変更内容 |
|---------|---------|---------|
| `src/lib/types.ts` | 変更 | `ExportData` インターフェースを追加 |
| `src/lib/storage.ts` | 変更 | `exportData()` / `importData()` / `validateExportData()` を追加 |
| `src/components/ApiTester.tsx` | 変更 | ヘッダーボタン追加、state・handler 追加、hidden input 追加 |

---

## 3. 型定義変更

### 3.1 追加する型（`src/lib/types.ts`）

既存の型定義ファイル末尾に追記する。

```typescript
// src/lib/types.ts

export interface ExportData {
  /** スキーマバージョン（現在は 1 固定） */
  version: 1;
  /** エクスポート日時（Unix タイムスタンプ ms） */
  exportedAt: number;
  categories: Category[];
  requests: SavedRequest[];
}
```

---

## 4. ストレージ関数追加（`src/lib/storage.ts`）

### 4.1 追加する 3 関数の概要

| 関数名 | 公開 | 説明 |
|-------|------|------|
| `validateExportData(raw: unknown): ExportData` | `export` | JSON パース済みオブジェクトのスキーマ検証 + フィールドストリップ |
| `exportData(): Promise<ExportData>` | `export` | IndexedDB から全データを取得して `ExportData` を返す |
| `importData(data: ExportData): Promise<void>` | `export` | 既存データを全消去してインポートデータを書き込む |

### 4.2 `validateExportData`

**目的**: `JSON.parse()` 後の `unknown` 値をスキーマ検証し、未知フィールドをストリップした安全な `ExportData` を返す。バリデーション失敗時は `Error` を throw する。

```typescript
export function validateExportData(raw: unknown): ExportData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('format');
  }
  const obj = raw as Record<string, unknown>;

  if (obj['version'] !== 1) {
    throw new Error('version');
  }
  if (!Array.isArray(obj['categories'])) {
    throw new Error('format');
  }
  if (!Array.isArray(obj['requests'])) {
    throw new Error('format');
  }

  return {
    version: 1,
    exportedAt: typeof obj['exportedAt'] === 'number' ? obj['exportedAt'] : Date.now(),
    categories: (obj['categories'] as unknown[]).map(stripCategory),
    requests: (obj['requests'] as unknown[]).map(stripSavedRequest),
  };
}
```

**プライベートヘルパー関数**（`storage.ts` 内に非公開で定義）:

```typescript
function stripKeyValuePair(raw: unknown): KeyValuePair {
  const kv = raw as Record<string, unknown>;
  return {
    id: typeof kv['id'] === 'string' ? kv['id'] : genId(),
    key: typeof kv['key'] === 'string' ? kv['key'] : '',
    value: typeof kv['value'] === 'string' ? kv['value'] : '',
    enabled: kv['enabled'] !== false,
  };
}

function stripCategory(raw: unknown): Category {
  const c = raw as Record<string, unknown>;
  const VALID_METHODS: HttpMethod[] = ['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS'];
  return {
    id: typeof c['id'] === 'string' ? c['id'] : genId(),
    name: typeof c['name'] === 'string' ? c['name'] : '',
    parentId: typeof c['parentId'] === 'string' ? c['parentId'] : null,
    defaultHeaders: Array.isArray(c['defaultHeaders'])
      ? (c['defaultHeaders'] as unknown[]).map(stripKeyValuePair) : [],
    defaultParams: Array.isArray(c['defaultParams'])
      ? (c['defaultParams'] as unknown[]).map(stripKeyValuePair) : [],
    variables: Array.isArray(c['variables'])
      ? (c['variables'] as unknown[]).map(stripKeyValuePair) : [],
    description: typeof c['description'] === 'string' ? c['description'] : undefined,
    createdAt: typeof c['createdAt'] === 'number' ? c['createdAt'] : Date.now(),
  };
}

function stripRequestState(raw: unknown): RequestState {
  const VALID_METHODS: HttpMethod[] = ['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS'];
  const r = raw as Record<string, unknown>;
  return {
    method: VALID_METHODS.includes(r['method'] as HttpMethod)
      ? (r['method'] as HttpMethod) : 'GET',
    url: typeof r['url'] === 'string' ? r['url'] : '',
    params: Array.isArray(r['params'])
      ? (r['params'] as unknown[]).map(stripKeyValuePair) : [],
    headers: Array.isArray(r['headers'])
      ? (r['headers'] as unknown[]).map(stripKeyValuePair) : [],
    body: typeof r['body'] === 'string' ? r['body'] : '',
    contentType: typeof r['contentType'] === 'string' ? r['contentType'] : 'application/json',
  };
}

function stripSavedRequest(raw: unknown): SavedRequest {
  const s = raw as Record<string, unknown>;
  return {
    id: typeof s['id'] === 'string' ? s['id'] : genId(),
    name: typeof s['name'] === 'string' ? s['name'] : '',
    categoryId: typeof s['categoryId'] === 'string' ? s['categoryId'] : null,
    request: typeof s['request'] === 'object' && s['request'] !== null
      ? stripRequestState(s['request']) : { method: 'GET', url: '', params: [], headers: [], body: '', contentType: 'application/json' },
    createdAt: typeof s['createdAt'] === 'number' ? s['createdAt'] : Date.now(),
  };
}
```

### 4.3 `exportData`

```typescript
export async function exportData(): Promise<ExportData> {
  const [categories, requests] = await Promise.all([getCategories(), getSaved()]);
  return {
    version: 1,
    exportedAt: Date.now(),
    categories,
    requests,
  };
}
```

### 4.4 `importData`

**処理フロー**:
1. `getDB()` で DB を取得する
2. `'categories'` と `'saved'` の両ストアに対して `readwrite` トランザクションを開く
3. 両ストアを `store.clear()` で全消去する
4. `data.categories` の各要素を `catStore.put()` で書き込む
5. `data.requests` の各要素を `savedStore.put()` で書き込む
6. `txDone(tx)` でトランザクション完了を待つ

```typescript
export async function importData(data: ExportData): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['categories', 'saved'], 'readwrite');
  const catStore = tx.objectStore('categories');
  const savedStore = tx.objectStore('saved');

  catStore.clear();
  savedStore.clear();

  for (const cat of data.categories) catStore.put(cat);
  for (const req of data.requests) savedStore.put(req);

  await txDone(tx);
}
```

> **注意**: `clear()` とその後の `put()` は同一トランザクション内でキューイングされるため、clearより前のデータが残ることはない。

---

## 5. コンポーネント変更

### 5.1 `ApiTester` (`src/components/ApiTester.tsx`)

#### 追加するインポート

```typescript
import { Download, Upload } from 'lucide-react';
import { ExportData } from '@/lib/types';
import { exportData, importData, validateExportData } from '@/lib/storage';
```

#### 追加する state

既存の `const [theme, setTheme] = ...` 付近に追記する。

```typescript
const [isExporting, setIsExporting] = useState(false);
const [isImporting, setIsImporting] = useState(false);
const [importMessage, setImportMessage] = useState<string | null>(null);
```

#### 追加する ref

既存の `const editingNameSyncRef = useRef<...>` 付近に追記する。

```typescript
const fileInputRef = useRef<HTMLInputElement>(null);
```

#### 追加するハンドラー

コメント `// ── history handlers` ブロックの後に追記する。

---

**`handleExport`** — エクスポート処理

```typescript
const handleExport = useCallback(async () => {
  setIsExporting(true);
  try {
    const data = await exportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-tester-export-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    setIsExporting(false);
  }
}, []);
```

---

**`handleImportClick`** — Import ボタン押下時

```typescript
const handleImportClick = useCallback(() => {
  fileInputRef.current?.click();
}, []);
```

---

**`handleFileChange`** — ファイル選択後の処理

```typescript
const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  // 同じファイルを再選択できるように input をリセット
  e.target.value = '';

  // 10 MB 超の警告
  if (file.size > 10 * 1024 * 1024) {
    if (!window.confirm('ファイルサイズが大きいため、処理に時間がかかる場合があります。続けますか？')) return;
  }

  // JSON パース
  let parsed: unknown;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    window.alert('ファイルを読み込めませんでした。有効な JSON ファイルを選択してください。');
    return;
  }

  // スキーマバリデーション
  let validated: ExportData;
  try {
    validated = validateExportData(parsed);
  } catch (err) {
    const isVersionError = err instanceof Error && err.message === 'version';
    window.alert(
      isVersionError
        ? 'ファイル形式が正しくありません。api-tester でエクスポートしたファイルを使用してください。'
        : 'ファイル形式が正しくありません。api-tester でエクスポートしたファイルを使用してください。'
    );
    return;
  }

  const catCount = validated.categories.length;
  const reqCount = validated.requests.length;

  // 確認ダイアログ
  if (!window.confirm(
    `カテゴリー ${catCount} 件、リクエスト ${reqCount} 件が含まれています。\n既存のすべてのデータが上書きされます。続けますか？`
  )) return;

  setIsImporting(true);
  try {
    await importData(validated);
    const [updatedCats, updatedReqs] = await Promise.all([getCategories(), getSaved()]);
    setCategories(updatedCats);
    setRequests(updatedReqs);
    setSelection(null);
    setImportMessage(`インポートしました（カテゴリー ${catCount} 件、リクエスト ${reqCount} 件）`);
    setTimeout(() => setImportMessage(null), 4000);
  } catch {
    window.alert('インポート中にエラーが発生しました。もう一度お試しください。');
  } finally {
    setIsImporting(false);
  }
}, []);
```

#### ヘッダー JSX の変更

**変更前**（`ApiTester.tsx` の `<header>` 内）:

```tsx
<header className="bg-[#0d1117]/80 backdrop-blur border-b border-slate-800/80 px-5 py-3 flex items-center justify-between flex-shrink-0">
  <span className="text-indigo-400 font-bold text-base tracking-tight flex items-center gap-2">
    <Zap size={16} className="text-indigo-400" /> API Tester
  </span>
  <button
    onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
    className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
  >
    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
  </button>
</header>
```

**変更後**:

```tsx
<header className="bg-[#0d1117]/80 backdrop-blur border-b border-slate-800/80 px-5 py-3 flex items-center justify-between flex-shrink-0">
  <span className="text-indigo-400 font-bold text-base tracking-tight flex items-center gap-2">
    <Zap size={16} className="text-indigo-400" /> API Tester
  </span>
  <div className="flex items-center gap-1">
    {/* Import */}
    <button
      onClick={handleImportClick}
      disabled={isImporting || isExporting}
      title="設定をインポート"
      className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Upload size={16} />
    </button>
    {/* Export */}
    <button
      onClick={handleExport}
      disabled={isExporting || isImporting}
      title="設定をエクスポート"
      className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download size={16} />
    </button>
    {/* Theme toggle */}
    <button
      onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
      className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  </div>
</header>
```

#### 成功メッセージ帯の追加

ヘッダーの直後（`<div className="flex flex-1 overflow-hidden">` の前）に挿入する。

```tsx
{importMessage && (
  <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-5 py-2 text-xs text-emerald-400 flex-shrink-0">
    {importMessage}
  </div>
)}
```

#### hidden file input の追加

`<header>` の直前（または `return` 直後の `<div>` 内のどこでもよい）に追加する。

```tsx
<input
  ref={fileInputRef}
  type="file"
  accept=".json"
  className="hidden"
  onChange={handleFileChange}
/>
```

---

## 6. ユーザー操作フロー詳細

### 6.1 エクスポートフロー

```
[Export] クリック
  → isExporting = true（ボタン無効化）
  → exportData() で IndexedDB から全データ取得
  → JSON.stringify() で文字列化
  → Blob → ObjectURL 生成
  → <a download="api-tester-export-YYYYMMDD-HHmmss.json"> をプログラム的クリック
  → URL.revokeObjectURL() でメモリ解放
  → isExporting = false（ボタン有効化）
```

### 6.2 インポートフロー

```
[Import] クリック
  → fileInputRef.current.click()
  → ブラウザのファイル選択ダイアログ（accept=".json"）

ファイル選択後
  → input.value = '' リセット
  → ファイルサイズ > 10 MB → window.confirm（処理は続行可）
  → file.text() で読み込み
  → JSON.parse() → 失敗時 alert() して中断
  → validateExportData() → 失敗時 alert() して中断
  → window.confirm（件数 + 上書き警告）→ キャンセルで中断
  → isImporting = true（ボタン無効化）
  → importData()（IndexedDB 全消去 + 書き込み）
    → 失敗時 alert() して中断
  → getCategories() / getSaved() で再フェッチ
  → setCategories / setRequests / setSelection(null) で UI 更新
  → importMessage セット → 4 秒後 null にクリア
  → isImporting = false（ボタン有効化）
```

---

## 7. エラーハンドリング方針

| エラー条件 | throw 内容 / 判定方法 | ユーザーへの表示 | 実装箇所 |
|-----------|---------------------|----------------|---------|
| ファイルが JSON として不正 | `JSON.parse()` 例外 | `window.alert('ファイルを読み込めませんでした…')` | `handleFileChange` |
| `version` フィールドが不正 | `validateExportData` が `throw new Error('version')` | `window.alert('ファイル形式が正しくありません…')` | `handleFileChange` |
| `categories`/`requests` が配列でない | `validateExportData` が `throw new Error('format')` | 同上 | `handleFileChange` |
| IndexedDB 書き込みエラー | `importData()` 内の `txDone(tx)` が reject | `window.alert('インポート中にエラーが発生しました…')` | `handleFileChange` |
| ファイルサイズ > 10 MB | `file.size > 10 * 1024 * 1024` | `window.confirm('処理に時間がかかる場合があります…')` | `handleFileChange` |

---

## 8. セキュリティ考慮事項

| 脅威 | 対策 |
|------|------|
| 任意コード実行 | `JSON.parse()` のみ使用し `eval()` は一切使わない |
| 未知フィールドの IndexedDB への混入 | `stripCategory` / `stripSavedRequest` / `stripKeyValuePair` / `stripRequestState` が既知フィールドのみを明示的に再構築してストリップする |
| 不正な `method` 値 | `stripRequestState` で `VALID_METHODS` 配列と照合し、不正値は `'GET'` にフォールバックする |
| XSS（インポートデータが DOM に挿入される場合） | 変数値や URL は既存の `applyVariables` を通じて展開されるだけで、innerHTML や dangerouslySetInnerHTML には渡さない。リスクなし。 |
| DoS（巨大ファイル） | 10 MB 超で `window.confirm` による警告。制限は設けないがユーザーに判断させる。 |

---

## 9. 実装手順

依存関係を考慮した推奨実装順序:

1. **`src/lib/types.ts`** — `ExportData` インターフェースを末尾に追加する
2. **`src/lib/storage.ts`** — プライベートヘルパー（`stripKeyValuePair` / `stripCategory` / `stripRequestState` / `stripSavedRequest`）と公開関数（`validateExportData` / `exportData` / `importData`）を末尾の `getExpandedCategories` より前に追加する
3. **`src/components/ApiTester.tsx`**:
   1. `import` 文に `Download`, `Upload`, `ExportData`, `exportData`, `importData`, `validateExportData` を追加する
   2. `useState` で `isExporting`, `isImporting`, `importMessage` を追加する
   3. `useRef` で `fileInputRef` を追加する
   4. `handleExport`, `handleImportClick`, `handleFileChange` を追加する
   5. `<header>` の右側ボタン群を `<div className="flex items-center gap-1">` で囲み、Import・Export ボタンを追加する
   6. ヘッダー直後に `importMessage` の条件付きレンダリングを追加する
   7. `<input type="file" ref={fileInputRef} ...>` を追加する

---

## 10. 影響を受ける既存機能

| 機能 | 影響内容 | 対応方針 |
|------|---------|---------|
| カテゴリーツリー | インポート後に `setCategories(updatedCats)` で即時再描画 | `handleFileChange` 内で対応済み |
| リクエスト一覧 | インポート後に `setRequests(updatedReqs)` で即時再描画 | `handleFileChange` 内で対応済み |
| 選択状態 | インポート後に `setSelection(null)` でリセット | ウェルカム画面を表示してユーザーに選択させる |
| 履歴 | エクスポート・インポートのスコープ外（仕様書で除外） | 変更なし |
| localStorage の展開状態 | インポート後もカテゴリー ID が変わる可能性があるが、展開状態が古い ID を参照しても破綻しない（ID がなければ何も展開されないだけ） | 対応不要 |

---

## 11. 懸念事項・リスク

- **`clear()` + `put()` のアトミック性**: 同一 IndexedDB トランザクション内の操作はキューイングされ順序保証がある。途中で例外が発生するとトランザクション全体がロールバックされるため、部分書き込みにはならない（ただし `txDone` が reject した場合のみ）。
- **ファイル選択後のキャンセル**: ユーザーが確認ダイアログで [キャンセル] した場合、IndexedDB は一切変更されない（`importData()` を呼ぶ前に `return` するため）。
- **巨大データのパフォーマンス**: カテゴリー 100 件・リクエスト 500 件でも `JSON.stringify` / `JSON.parse` は数 ms 程度。IndexedDB の一括書き込みも 100ms 以内が期待値。仕様の 2 秒以内の要件を満たす。
