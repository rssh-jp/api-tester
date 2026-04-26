# DESIGN-カテゴリー配下リクエスト一括実行: Category Batch Run

## 1. 概要

- **対応仕様書**: `docs/specs/SPEC-カテゴリー配下リクエスト一括実行.md`
- **設計方針**:
  - `CategoryEditor.tsx` にタブ「Batch Run」を追加し、新規コンポーネント `BatchRunTab.tsx` をタブコンテンツとして組み込む
  - `ApiTester.tsx` は `CategoryEditor` に `requests` と `onSelectRequest` を追加で渡すだけの最小変更
  - バッチ実行結果は永続化しない（`BatchRunTab` 内 `useState` のみで管理）

---

## 2. 変更対象ファイル一覧

| ファイル | 種別 | 変更理由 |
|---------|------|---------|
| `lib/types.ts` | 変更 | `BatchRunStatus` 型・`BatchRunResult` インターフェースを追加 |
| `components/CategoryEditor.tsx` | 変更 | タブに「Batch Run」を追加、`requests` / `onSelectRequest` props を追加 |
| `components/ApiTester.tsx` | 変更 | `CategoryEditor` に `requests` / `onSelectRequest` を渡すよう更新 |
| `components/BatchRunTab.tsx` | **新規** | バッチ実行 UI とロジック全体を担うコンポーネント |

---

## 3. 型定義の変更（`lib/types.ts`）

既存型の変更はなし。末尾に以下を追加する。

```typescript
// lib/types.ts への追加

/** バッチ実行における個別リクエストの実行状態 */
export type BatchRunStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped';

/** バッチ実行における個別リクエストの実行結果 */
export interface BatchRunResult {
  requestId: string;
  requestName: string;
  method: HttpMethod;
  url: string;
  status: BatchRunStatus;
  httpStatus?: number;       // 実行完了時のみ
  httpStatusText?: string;   // 実行完了時のみ
  responseTime?: number;     // ms、実行完了時のみ
  error?: string;            // ネットワークエラー等のメッセージ
}
```

---

## 4. コンポーネント設計

### 4.1 変更するコンポーネント

#### `CategoryEditor` (`components/CategoryEditor.tsx`)

**変更内容: Props 追加**

```typescript
// 変更前
interface CategoryEditorProps {
  category: Category;
  categories: Category[];
  onChange: (updated: Category) => void;
}

// 変更後
interface CategoryEditorProps {
  category: Category;
  categories: Category[];
  requests: SavedRequest[];                   // 追加
  onChange: (updated: Category) => void;
  onSelectRequest: (id: string) => void;      // 追加（行クリック時に左ペインで選択）
}
```

**変更内容: Tab 型と TABS 配列**

```typescript
// 変更前
type Tab = 'Default Headers' | 'Default Params' | 'Inheritance Preview';
const TABS: Tab[] = ['Default Headers', 'Default Params', 'Inheritance Preview'];

// 変更後
type Tab = 'Default Headers' | 'Default Params' | 'Inheritance Preview' | 'Batch Run';
const TABS: Tab[] = ['Default Headers', 'Default Params', 'Inheritance Preview', 'Batch Run'];
```

**変更内容: import 追加**

```typescript
import { SavedRequest } from '@/lib/types';  // 追加
import BatchRunTab from './BatchRunTab';      // 追加
```

**変更内容: タブコンテンツに Batch Run の分岐追加**

`activeTab === 'Inheritance Preview'` のブロックの後に以下を追加する。

```tsx
{activeTab === 'Batch Run' && (
  <BatchRunTab
    category={category}
    categories={categories}
    requests={requests}
    onSelectRequest={onSelectRequest}
  />
)}
```

`BatchRunTab` は独立したスクロール領域を持つため、`<div className="flex-1 overflow-auto p-5">` の `overflow-auto` と `p-5` は `Batch Run` タブ選択時には不要になる。実装時は以下のように切り替える。

```tsx
{/* Tab content */}
<div className={`flex-1 overflow-hidden ${activeTab !== 'Batch Run' ? 'overflow-auto p-5' : ''}`}>
  {/* ... 各タブの内容 */}
</div>
```

#### `ApiTester` (`components/ApiTester.tsx`)

CategoryEditor の使用箇所（1箇所のみ）に props を追加する。

```tsx
// 変更前
<CategoryEditor
  category={selectedCategory}
  categories={categories}
  onChange={handleCategoryChange}
/>

// 変更後
<CategoryEditor
  category={selectedCategory}
  categories={categories}
  requests={requests}
  onChange={handleCategoryChange}
  onSelectRequest={id => setSelection({ type: 'request', id })}
/>
```

### 4.2 新規作成コンポーネント

#### `BatchRunTab` (`components/BatchRunTab.tsx`)

- **役割**: バッチ実行 UI の表示・実行ロジックの管理
- **種別**: Client Component（`'use client'` 必要）

**Props 型**:

```typescript
interface BatchRunTabProps {
  category: Category;
  categories: Category[];
  requests: SavedRequest[];        // 全 SavedRequest（フィルタは内部で行う）
  onSelectRequest: (id: string) => void;
}
```

**State 定義**:

```typescript
const [results, setResults] = useState<BatchRunResult[]>([]);
const [running, setRunning] = useState(false);
const [includeSubcategories, setIncludeSubcategories] = useState(false);
const [hasRun, setHasRun] = useState(false);
```

- `results`: 実行対象リクエストの結果リスト。`pending` → `running` → `success` / `failure` / `skipped` と遷移。
- `running`: `true` のとき Run All ボタンを無効化。
- `includeSubcategories`: チェックボックスの状態。
- `hasRun`: 初回実行完了後 `true`。ボタンラベルを「Re-run」に変える判定に使用。

**カテゴリー切り替えリセット**:

`category.id` が変化したとき、実行結果をリセットする。

```typescript
useEffect(() => {
  setResults([]);
  setHasRun(false);
  setRunning(false);
}, [category.id]);
```

---

## 5. バッチ実行ロジック詳細（`BatchRunTab.tsx` 内部）

### 5.1 リクエスト収集（`collectRequests`）

```typescript
function collectRequests(
  categoryId: string,
  includeSubcategories: boolean
): SavedRequest[] {
  const direct = requests.filter(r => r.categoryId === categoryId);
  if (!includeSubcategories) return direct;
  const children = categories.filter(c => c.parentId === categoryId);
  const childRequests = children.flatMap(c =>
    collectRequests(c.id, true)
  );
  return [...direct, ...childRequests];
}
```

### 5.2 URL 組立ヘルパー（`buildUrlWithParams`）

`ApiTester.tsx` と同等のロジックを `BatchRunTab.tsx` 内にローカル関数として定義する。

```typescript
function buildUrlWithParams(baseUrl: string, params: KeyValuePair[]): string {
  const enabledParams = params.filter(p => p.key && p.enabled);
  if (enabledParams.length === 0) return baseUrl;
  try {
    const urlStr = baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`;
    const url = new URL(urlStr);
    enabledParams.forEach(p => url.searchParams.set(p.key, p.value));
    return baseUrl.includes('://') ? url.toString() : url.toString().replace('https://', '');
  } catch {
    const qs = enabledParams
      .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    return baseUrl.includes('?') ? `${baseUrl}&${qs}` : `${baseUrl}?${qs}`;
  }
}
```

### 5.3 逐次実行フロー（`runAll`）

```typescript
async function runAll() {
  const targets = collectRequests(category.id, includeSubcategories);
  if (targets.length === 0) return;

  setRunning(true);
  setHasRun(false);

  // 初期化: 全件を pending 状態にセット
  setResults(
    targets.map(req => ({
      requestId: req.id,
      requestName: req.name,
      method: req.request.method,
      url: req.request.url,
      status: 'pending',
    }))
  );

  // 逐次実行
  for (const req of targets) {
    // Running に更新
    setResults(prev =>
      prev.map(r => r.requestId === req.id ? { ...r, status: 'running' } : r)
    );

    // URL 空チェック → スキップ
    if (!req.request.url.trim()) {
      setResults(prev =>
        prev.map(r => r.requestId === req.id ? { ...r, status: 'skipped' } : r)
      );
      continue;
    }

    try {
      // カテゴリー継承を適用
      const { headers: effectiveHeaders, params: effectiveParams } =
        computeEffectiveValues(
          req.request.headers,
          req.request.params,
          req.categoryId,
          categories
        );

      // URL にパラメータを組み込む
      let baseUrl = req.request.url;
      try {
        const urlStr = baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`;
        const parsed = new URL(urlStr);
        parsed.search = '';
        baseUrl = req.request.url.includes('://')
          ? parsed.toString()
          : parsed.toString().replace('https://', '');
      } catch {
        baseUrl = req.request.url.split('?')[0];
      }
      const finalUrl = buildUrlWithParams(baseUrl, effectiveParams);

      // ヘッダーをオブジェクトへ変換
      const headersObj: Record<string, string> = {};
      effectiveHeaders.forEach(h => { headersObj[h.key] = h.value; });
      if (
        req.request.contentType &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.request.method)
      ) {
        headersObj['Content-Type'] = req.request.contentType;
      }

      // /api/proxy 経由で送信
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: req.request.method,
          url: finalUrl,
          headers: headersObj,
          body: req.request.body || undefined,
        }),
      });
      const data = await res.json();

      // error フィールドがある場合は失敗扱い
      if (data.error) {
        setResults(prev =>
          prev.map(r =>
            r.requestId === req.id
              ? { ...r, status: 'failure', error: data.error, responseTime: data.responseTime }
              : r
          )
        );
        continue;
      }

      const isSuccess = data.status >= 200 && data.status < 300;
      setResults(prev =>
        prev.map(r =>
          r.requestId === req.id
            ? {
                ...r,
                status: isSuccess ? 'success' : 'failure',
                httpStatus: data.status,
                httpStatusText: data.statusText,
                responseTime: data.responseTime,
              }
            : r
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      setResults(prev =>
        prev.map(r =>
          r.requestId === req.id ? { ...r, status: 'failure', error: message } : r
        )
      );
    }
  }

  setRunning(false);
  setHasRun(true);
}
```

**ポイント**:
- `for...of` による逐次実行（並列実行は行わない）
- 各リクエスト完了ごとに `setResults` を呼び、UI を即時更新する（全完了を待たない）
- `catch` で捕捉したエラーは当該行を `failure` にして次のリクエストへ進む

---

## 6. UIコンポーネント構造（BatchRunTab.tsx の JSX 大要）

```tsx
<div className="flex flex-col h-full">

  {/* ツールバー */}
  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
    <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={includeSubcategories}
        onChange={e => setIncludeSubcategories(e.target.checked)}
        disabled={running}
        className="..."
      />
      Include subcategories
    </label>

    <button
      onClick={runAll}
      disabled={running || targets.length === 0}
      aria-disabled={running || targets.length === 0}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
                 bg-indigo-600 hover:bg-indigo-500 text-white
                 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {running
        ? <><Loader2 size={14} className="animate-spin" role="status" /> Running…</>
        : hasRun
          ? <><RotateCcw size={14} /> Re-run</>
          : <><Play size={14} /> Run All</>
      }
    </button>
  </div>

  {/* コンテンツ */}
  <div className="flex-1 overflow-auto">

    {/* 空状態 */}
    {targets.length === 0 && (
      <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
        <Inbox size={28} />
        <p className="text-sm">No requests in this category</p>
      </div>
    )}

    {/* リクエスト一覧テーブル */}
    {targets.length > 0 && (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-600 border-b border-slate-800">
            <th className="px-4 py-2 text-left w-20">Method</th>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">URL</th>
            <th className="px-4 py-2 text-right w-24">Status</th>
            <th className="px-4 py-2 text-right w-20">Time</th>
            <th className="px-4 py-2 text-center w-8"></th>
          </tr>
        </thead>
        <tbody>
          {displayResults.map(row => (
            <tr
              key={row.requestId}
              onClick={() => onSelectRequest(row.requestId)}
              className={`border-b border-slate-800/50 cursor-pointer transition-colors
                ${row.status === 'success' ? 'hover:bg-emerald-500/5' :
                  row.status === 'failure' ? 'hover:bg-red-500/5' :
                  'hover:bg-slate-800/30'}`}
            >
              <td className="px-4 py-2.5">
                <MethodBadge method={row.method} />
              </td>
              <td className="px-4 py-2.5 text-slate-300 truncate max-w-[160px]">
                {row.requestName}
              </td>
              <td className="px-4 py-2.5 text-slate-500 font-mono truncate max-w-[220px]">
                {row.url || '—'}
              </td>
              <td className="px-4 py-2.5 text-right">
                <StatusCell result={row} />
              </td>
              <td className="px-4 py-2.5 text-right text-slate-500 font-mono">
                {row.responseTime != null ? `${row.responseTime} ms` : '—'}
              </td>
              <td className="px-4 py-2.5 text-center">
                <StatusIcon status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}

    {/* サマリー（全完了後） */}
    {allDone && (
      <div className="px-5 py-3 border-t border-slate-800 text-sm text-slate-400 flex gap-4">
        <span className="text-emerald-400 font-semibold">{passed} passed</span>
        <span className="text-red-400 font-semibold">{failed} failed</span>
        <span className="text-slate-600">{passed + failed} total</span>
      </div>
    )}

  </div>
</div>
```

**サブコンポーネント（BatchRunTab.tsx 内に定義）**:

- `MethodBadge({ method })` — メソッド別カラーバッジ（`ApiTester.tsx` の `METHOD_BG` 相当）
- `StatusCell({ result })` — `running` 時は「Running」、`skipped` は「Skipped」、完了後は `httpStatus httpStatusText` を表示
- `StatusIcon({ status })` — `success` → `✅`（`CheckCircle2` 緑）、`failure` → `❌`（`XCircle` 赤）、`running` → `Loader2` スピナー、`pending` → `—`、`skipped` → グレーダッシュ

**`displayResults` について**:

`results` が空（まだ Run All 未実行）の場合は、収集したリクエスト一覧を `pending` 状態で初期表示するため、以下のロジックを使う。

```typescript
const displayResults: BatchRunResult[] =
  results.length > 0
    ? results
    : targets.map(req => ({
        requestId: req.id,
        requestName: req.name,
        method: req.request.method,
        url: req.request.url,
        status: 'pending' as BatchRunStatus,
      }));
```

これにより「Run All 前にリクエスト名と URL だけ一覧表示し、ステータス列は `—`」という仕様（4.3）を満たす。

---

## 7. エラーハンドリング設計

| エラー条件 | 検出箇所 | 結果 | 表示 |
|-----------|---------|------|------|
| URL が空 | `runAll()` 内の事前チェック | `status: 'skipped'` | 「Skipped」グレー |
| ネットワークエラー / `fetch` 例外 | `catch (err)` | `status: 'failure'`, `error: message` | 「Error」赤系ハイライト |
| `/api/proxy` が `error` フィールドを返却 | `data.error` チェック | `status: 'failure'`, `error: data.error` | 「Error」赤系ハイライト |
| HTTP 3xx / 4xx / 5xx | `data.status` の 2xx 外判定 | `status: 'failure'` | ステータスコード 赤系ハイライト |
| リクエスト 0 件 | `targets.length === 0` | ボタン無効化 + 空状態メッセージ | 「No requests in this category」 |

- `skipped` は「サマリーのカウント対象外」とする（`passed + failed` のみ表示）
- エラーが発生した行の `tr` に `bg-red-500/10` を付与し、成功行には `bg-emerald-500/10` を付与する

---

## 8. 実装手順

以下の順序で実装する（依存関係を考慮）。

1. **型定義の追加** (`lib/types.ts`)
   - `BatchRunStatus` と `BatchRunResult` を末尾に追加する

2. **BatchRunTab コンポーネントの作成** (`components/BatchRunTab.tsx`)
   - `BatchRunTabProps` の定義
   - `collectRequests`・`buildUrlWithParams` のローカル関数定義
   - `runAll` の逐次実行ロジック実装
   - JSX：ツールバー → テーブル → サマリーの構造

3. **CategoryEditor の変更** (`components/CategoryEditor.tsx`)
   - `SavedRequest` import 追加
   - `BatchRunTab` import 追加
   - `CategoryEditorProps` に `requests`, `onSelectRequest` を追加
   - `Tab` 型・`TABS` 配列に `'Batch Run'` を追加
   - タブコンテンツに `BatchRunTab` の分岐を追加
   - タブコンテンツラッパーの `overflow-auto p-5` を `Batch Run` 時に除外

4. **ApiTester の変更** (`components/ApiTester.tsx`)
   - `<CategoryEditor>` に `requests={requests}` と `onSelectRequest={...}` を追加

---

## 9. 影響を受ける既存機能

| 機能名 | 影響内容 | 対応方針 |
|-------|---------|---------|
| Default Headers タブ | タブ並びに `Batch Run` が追加されるが動作変更なし | リグレッションなし |
| Default Params タブ | 同上 | リグレッションなし |
| Inheritance Preview タブ | 同上 | リグレッションなし |
| CategoryEditor の表示 | `requests` / `onSelectRequest` props が必須になる | `ApiTester` での呼び出しを同時に更新する |
| 左ペインの選択状態 | `onSelectRequest(id)` が `setSelection({ type: 'request', id })` を呼ぶため、バッチ結果行クリックで左ペインのリクエストが選択状態になる | 仕様通り（推奨要件 AC） |

---

## 10. 懸念事項・リスク

- **リクエスト数が多い場合の UX**: 逐次実行のため 100 件以上になると完了まで時間がかかる。仕様上タイムアウトは `/api/proxy` 既存設定に依存。現時点では対処不要（並列実行は Nice to Have）。
- **カテゴリー切り替え時のリセット**: `useEffect([category.id])` で `results` をリセットするため、別カテゴリーに移動してから戻ると結果が消える。仕様（6.2「タブ切り替えまたはカテゴリー切り替え時にリセット」）通りの挙動であり問題なし。
- **`includeSubcategories` 変更後の再実行**: チェックを変えた後は「Re-run」ボタンを押すまで `displayResults` は前回結果のまま。チェック変更時に `results` をリセットするかどうかは仕様に明示がないが、混乱を避けるためリセットする方針とする。

```typescript
// includeSubcategories 変更時に results をリセット
const handleToggleSubcategories = (checked: boolean) => {
  setIncludeSubcategories(checked);
  setResults([]);
  setHasRun(false);
};
```
