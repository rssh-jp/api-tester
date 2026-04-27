# DESIGN-環境変数: Category Variables（カテゴリー変数）

> **ステータス**: 草稿
> **作成日**: 2026-04-27
> **最終更新**: 2026-04-27

---

## 対応仕様書

- [`SPEC-環境変数.md`](../specs/SPEC-環境変数.md)

---

## 1. 概要

- **対応仕様書**: `docs/specs/SPEC-環境変数.md`
- **設計方針**: 既存の `KeyValuePair` / `Category` 型を最大限に再利用し、新規ファイルは追加せず既存ファイルへの追加・変更のみで実装する。変数置換は `lib/inheritance.ts` に集約し、送信直前（`ApiTester.tsx` の `handleSend`）で一括適用する。

---

## 2. 変更ファイル一覧

| ファイル | 変更種別 | 変更概要 |
|---------|---------|---------|
| `lib/types.ts` | 変更 | `Category` 型に `variables: KeyValuePair[]` を追加 |
| `lib/storage.ts` | 変更 | `getCategories()` にマイグレーション処理を追加、`duplicateCategory()` 内の `cloneCategory` で `variables` を複製 |
| `lib/inheritance.ts` | 追加 | `computeEffectiveVariables()` 関数、`applyVariables()` 関数を追加 |
| `components/ApiTester.tsx` | 変更 | `computeEffectiveVariables` / `applyVariables` のインポート追加、`handleSend` に変数置換処理を追加、`handleAddCategory` の新規カテゴリーに `variables: []` を追加 |
| `components/CategoryEditor.tsx` | 変更 | Settings タブに「Variables」セクションを追加、`InheritanceCard` / `InheritancePreview` に Variables 列を追加 |

型定義以外の新規ファイル追加・API Route の変更はなし。

---

## 3. 型定義変更

### `lib/types.ts`

```typescript
// 変更前
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  defaultHeaders: KeyValuePair[];
  defaultParams: KeyValuePair[];
  description?: string;
  createdAt: number;
}

// 変更後
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  defaultHeaders: KeyValuePair[];
  defaultParams: KeyValuePair[];
  variables: KeyValuePair[];   // ← 追加
  description?: string;
  createdAt: number;
}
```

---

## 4. ストレージ変更

### 4.1 `getCategories()` — マイグレーション

IndexedDB から読み込んだ旧 `Category` レコードに `variables` フィールドがない場合を自動補完する。スプレッド順を `{ variables: [], ...c }` とすることで、既存データに `variables` が存在する場合は既存値が優先される。

```typescript
// lib/storage.ts の getCategories() 変更後
export async function getCategories(): Promise<Category[]> {
  if (typeof window === 'undefined') return [];
  const db = await getDB();
  const tx = db.transaction('categories', 'readonly');
  const all = await idbReq<Category[]>(tx.objectStore('categories').getAll());
  return all
    .map(c => ({ variables: [], ...c }))   // ← マイグレーション追加
    .sort((a, b) => b.createdAt - a.createdAt);
}
```

### 4.2 `duplicateCategory()` — `cloneCategory` 内の複製処理

`duplicateCategory` 内の `cloneCategory` ヘルパーが `variables` フィールドも複製するよう変更する。現在は `defaultHeaders` / `defaultParams` のみ `id` を振り直している。

```typescript
// 変更前
newCategories.push({
  ...cat,
  id: newId,
  parentId,
  name: isRoot ? `${cat.name} (copy)` : cat.name,
  defaultHeaders: cat.defaultHeaders.map(h => ({ ...h, id: genId() })),
  defaultParams: cat.defaultParams.map(p => ({ ...p, id: genId() })),
  createdAt: Date.now(),
});

// 変更後
newCategories.push({
  ...cat,
  id: newId,
  parentId,
  name: isRoot ? `${cat.name} (copy)` : cat.name,
  defaultHeaders: cat.defaultHeaders.map(h => ({ ...h, id: genId() })),
  defaultParams: cat.defaultParams.map(p => ({ ...p, id: genId() })),
  variables: (cat.variables ?? []).map(v => ({ ...v, id: genId() })),   // ← 追加
  createdAt: Date.now(),
});
```

---

## 5. 継承ロジック変更

### 5.1 変数の優先度ルール

ヘッダー / パラメータの継承とは**逆方向**で、子カテゴリー（直近）が最優先となる。

```
直近（immediate）カテゴリー（最強）> 中間カテゴリー > ルートカテゴリー（最弱）
```

`enabled: false` のエントリはマージ結果から除外する。

### 5.2 `computeEffectiveVariables()` の追加

`lib/inheritance.ts` に以下を追加する。

```typescript
/**
 * Resolve variables for a category chain.
 *
 * Priority (highest wins): immediate category → ... → root category
 * (opposite of headers/params — child overrides parent)
 */
export function computeEffectiveVariables(
  categoryId: string | null,
  categories: Category[]
): Map<string, string> {
  const chain = buildCategoryChain(categoryId, categories);
  const result = new Map<string, string>();

  // Weakest: immediate category (processed first, may be overwritten by root).
  // Strongest: root category (processed last, final write wins).
  //
  // Wait — child-wins means immediate must be LAST (not overwritten).
  // chain = [immediate, ..., root]; iterate immediate→root so root is first,
  // immediate is last → immediate overwrites root.
  //
  // To achieve child-wins: iterate from root (chain.length-1) down to 0 (immediate).
  // Each iteration overwrites the previous; immediate (i=0) is written last → wins.
  for (let i = chain.length - 1; i >= 0; i--) {
    const cat = chain[i];
    for (const kv of cat.variables ?? []) {
      if (kv.key && kv.enabled) {
        result.set(kv.key, kv.value);
      }
    }
  }

  return result;
}
```

**ループの根拠**  
`buildCategoryChain` が返すチェーンは `[immediate, ..., root]` の順（インデックス 0 が直近、末尾がルート）。ループを `i = chain.length - 1`（root）→ `i = 0`（immediate）の順に回すと、`Map.set()` の上書き特性により、**最後に書き込まれた immediate の値が残る**。これにより「子カテゴリーが最強」を実現する。

### 5.3 `applyVariables()` の追加

```typescript
/**
 * Replace ${KEY} placeholders in text with values from the variables map.
 * Undefined variables are left as-is (silent pass-through).
 */
export function applyVariables(
  text: string,
  variables: Map<string, string>
): string {
  if (variables.size === 0) return text;
  return text.replace(/\$\{([^}]+)\}/g, (match, key) =>
    variables.has(key) ? variables.get(key)! : match
  );
}
```

- 正規表現 `/\$\{([^}]+)\}/g` で `${KEY}` 形式を一括置換する。
- キャプチャグループ `([^}]+)` は `}` を含まない 1 文字以上の任意文字列を変数名として受け入れる。
- 変数マップに存在しないキーはマッチ文字列（`${KEY}`）をそのまま返す。
- パフォーマンス: 変数が 0 件の場合は正規表現処理をスキップして早期リターンする。

---

## 6. リクエスト送信フローの変更

### `components/ApiTester.tsx` — `handleSend`

**変更内容 1: インポートへの追加**

```typescript
// 変更前
import { computeEffectiveValues, buildCategoryChain, mergeKeyValues } from '@/lib/inheritance';

// 変更後
import {
  computeEffectiveValues,
  buildCategoryChain,
  mergeKeyValues,
  computeEffectiveVariables,   // ← 追加
  applyVariables,              // ← 追加
} from '@/lib/inheritance';
```

**変更内容 2: `handleSend` 内の変数置換適用**

変数置換は以下の順序で適用する：
1. カテゴリーチェーンから有効変数マップを取得
2. ヘッダー・パラメータのマージ（`computeEffectiveValues` は変更なし）
3. マージ後のヘッダー値・パラメータ値に変数置換を適用
4. URL 文字列に変数置換を適用（パラメータ展開・URL パースより前）
5. ボディ文字列に変数置換を適用

```typescript
// handleSend 内の変更箇所（既存コードの差分のみ抜粋）

const categoryId = selectedRequest?.categoryId ?? null;

// ── 1. 変数マップの解決 ──────────────────────────────────────────────────
const effectiveVars = computeEffectiveVariables(categoryId, categories);

// ── 2. ヘッダー・パラメータの継承マージ ─────────────────────────────────
const { headers: mergedHeaders, params: mergedParams } = computeEffectiveValues(
  editingRequest.headers,
  editingRequest.params,
  categoryId,
  categories,
);

// ── 3. マージ後の値に変数置換を適用 ──────────────────────────────────────
const effectiveHeaders = mergedHeaders.map(h => ({
  ...h,
  value: applyVariables(h.value, effectiveVars),
}));
const effectiveParams = mergedParams.map(p => ({
  ...p,
  value: applyVariables(p.value, effectiveVars),
}));

// ── 4. URL への変数置換（既存の URL パース処理より前に適用） ─────────────
let baseUrl = applyVariables(editingRequest.url, effectiveVars);   // ← 変更
try {
  const urlStr = baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`;
  const parsed = new URL(urlStr);
  parsed.search = '';
  baseUrl = baseUrl.includes('://') ? parsed.toString() : parsed.toString().replace('https://', '');
  if (!editingRequest.url.endsWith('/') && baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
} catch {
  baseUrl = baseUrl.split('?')[0];
}
const finalUrl = buildUrlWithParams(baseUrl, effectiveParams);

// enabledHeaders 組み立て（effectiveHeaders を使う）
const enabledHeaders: Record<string, string> = {};
effectiveHeaders.forEach(h => { enabledHeaders[h.key] = h.value; });   // ← effectiveHeaders に変更
if (editingRequest.contentType && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(editingRequest.method)) {
  enabledHeaders['Content-Type'] = editingRequest.contentType;
}

// ── 5. ボディへの変数置換 ─────────────────────────────────────────────────
const resolvedBody = applyVariables(editingRequest.body || '', effectiveVars);   // ← 追加

const data = await sendRequest({
  method: editingRequest.method,
  url: finalUrl,
  headers: enabledHeaders,
  body: resolvedBody || undefined,   // ← editingRequest.body から変更
});
```

**変更内容 3: `handleAddCategory` への `variables: []` 追加**

新規カテゴリー作成時に `variables` フィールドを初期化する。

```typescript
// 変更前
const cat: Category = {
  id: genId(),
  name: name.trim(),
  parentId,
  defaultHeaders: [],
  defaultParams: [],
  createdAt: Date.now(),
};

// 変更後
const cat: Category = {
  id: genId(),
  name: name.trim(),
  parentId,
  defaultHeaders: [],
  defaultParams: [],
  variables: [],   // ← 追加
  createdAt: Date.now(),
};
```

---

## 7. UI変更

### `components/CategoryEditor.tsx`

#### 7.1 Settings タブへの「Variables」セクション追加

Settings タブ（`activeTab === 'Settings'`）の先頭（Default Headers セクションより前）に以下を挿入する。

```tsx
<section>
  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Variables</h3>
  <div className="flex items-start gap-2 mb-4 bg-indigo-500/5 border border-indigo-500/20 rounded-lg px-3 py-2.5 text-xs text-slate-400">
    <Info size={14} className="mt-0.5 flex-shrink-0 text-indigo-400" />
    <span>
      Use <code className="font-mono text-indigo-300">{'${VARIABLE_NAME}'}</code> in URL, header values,
      param values, and body. Child category values take precedence over parents.
    </span>
  </div>
  <KeyValueTable
    pairs={category.variables ?? []}
    onChange={newPairs => onChange({ ...category, variables: newPairs })}
    showEnabled={true}
    keyPlaceholder="Variable name"
    valuePlaceholder="Value"
  />
</section>
```

- `category.variables ?? []` で旧データ（`variables` なし）にも対応する。
- `onChange` は他の Settings フィールドと同様、`category` を更新して親コンポーネントに伝播する（即時 IndexedDB 保存は `ApiTester.tsx` の `handleCategoryChange` が担う）。

#### 7.2 `InheritanceCard` への Variables 列追加

`InheritanceCard` の Props と `grid-cols-2` グリッドを `grid-cols-3` に変更し、Variables 列を追加する。

**Props の変更:**

```typescript
// 変更前
function InheritanceCard({
  name, defaultHeaders, defaultParams, depth, isCurrent, isRoot,
}: {
  name: string;
  defaultHeaders: KeyValuePair[];
  defaultParams: KeyValuePair[];
  depth: number;
  isCurrent?: boolean;
  isRoot?: boolean;
})

// 変更後
function InheritanceCard({
  name, defaultHeaders, defaultParams, variables, depth, isCurrent, isRoot,
}: {
  name: string;
  defaultHeaders: KeyValuePair[];
  defaultParams: KeyValuePair[];
  variables: KeyValuePair[];        // ← 追加
  depth: number;
  isCurrent?: boolean;
  isRoot?: boolean;
})
```

**グリッド部分の変更:**

```tsx
// 変更前
<div className="grid grid-cols-2 gap-3">
  <div>
    <span className="text-xs text-slate-500 uppercase tracking-wide">Headers</span>
    <div className="mt-1"><KVSummary pairs={defaultHeaders} /></div>
  </div>
  <div>
    <span className="text-xs text-slate-500 uppercase tracking-wide">Params</span>
    <div className="mt-1"><KVSummary pairs={defaultParams} /></div>
  </div>
</div>

// 変更後
<div className="grid grid-cols-3 gap-3">
  <div>
    <span className="text-xs text-slate-500 uppercase tracking-wide">Headers</span>
    <div className="mt-1"><KVSummary pairs={defaultHeaders} /></div>
  </div>
  <div>
    <span className="text-xs text-slate-500 uppercase tracking-wide">Params</span>
    <div className="mt-1"><KVSummary pairs={defaultParams} /></div>
  </div>
  <div>
    <span className="text-xs text-slate-500 uppercase tracking-wide">Variables</span>
    <div className="mt-1"><KVSummary pairs={variables} /></div>
  </div>
</div>
```

#### 7.3 `InheritancePreview` での `InheritanceCard` 呼び出し箇所の更新

現在のカテゴリーカードと祖先カテゴリーカードの両方に `variables` prop を追加する。

```tsx
// 変更前（current カード）
<InheritanceCard
  name={`${category.name || 'Unnamed'} (this)`}
  defaultHeaders={category.defaultHeaders}
  defaultParams={category.defaultParams}
  depth={0}
  isCurrent
/>

// 変更後（current カード）
<InheritanceCard
  name={`${category.name || 'Unnamed'} (this)`}
  defaultHeaders={category.defaultHeaders}
  defaultParams={category.defaultParams}
  variables={category.variables ?? []}   // ← 追加
  depth={0}
  isCurrent
/>
```

```tsx
// 変更前（祖先カード）
{ancestorChain.map((cat, i) => (
  <InheritanceCard
    key={cat.id}
    name={cat.name}
    defaultHeaders={cat.defaultHeaders}
    defaultParams={cat.defaultParams}
    depth={i + 1}
    isRoot={i === ancestorChain.length - 1}
  />
))}

// 変更後（祖先カード）
{ancestorChain.map((cat, i) => (
  <InheritanceCard
    key={cat.id}
    name={cat.name}
    defaultHeaders={cat.defaultHeaders}
    defaultParams={cat.defaultParams}
    variables={cat.variables ?? []}   // ← 追加
    depth={i + 1}
    isRoot={i === ancestorChain.length - 1}
  />
))}
```

---

## 8. 実装手順

以下の順序で実装する（依存関係を考慮した順序）:

1. **型定義の変更** (`lib/types.ts`)
   - `Category` インターフェースに `variables: KeyValuePair[]` を追加する
2. **ストレージ関数の変更** (`lib/storage.ts`)
   - `getCategories()` に `map(c => ({ variables: [], ...c }))` を追加する
   - `duplicateCategory()` 内の `cloneCategory` ヘルパーに `variables` 複製処理を追加する
3. **継承・変数置換関数の追加** (`lib/inheritance.ts`)
   - `computeEffectiveVariables()` を追加する
   - `applyVariables()` を追加する
4. **コンポーネントの変更** (`components/ApiTester.tsx`)
   - インポートに `computeEffectiveVariables` / `applyVariables` を追加する
   - `handleSend` に変数置換処理を追加する（手順は §6 参照）
   - `handleAddCategory` の新規カテゴリーオブジェクトに `variables: []` を追加する
5. **UIの変更** (`components/CategoryEditor.tsx`)
   - `InheritanceCard` に `variables` prop を追加し `grid-cols-3` に変更する
   - `InheritancePreview` の各カード呼び出しに `variables` prop を追加する
   - Settings タブに Variables セクションを追加する

---

## 9. 影響を受ける既存機能

| 機能名 | 影響内容 | 対応方針 |
|-------|---------|---------|
| カテゴリー複製 | `variables` が複製されない | `duplicateCategory` の `cloneCategory` で `variables` も複製する（§4.2） |
| 既存カテゴリーデータ | `variables` フィールドなし（旧データ） | `getCategories()` 読み込み時に `variables: []` を補完するマイグレーションで対応する（§4.1） |
| Inheritance Preview UI | `InheritanceCard` が `grid-cols-2` | `grid-cols-3` に変更し Variables 列を追加する（§7.2） |
| バッチ実行（`BatchRunTab`） | 変数置換なし（`handleSend` 経由でないパス） | バッチ実行のリクエスト送信関数内でも変数置換の適用が必要かどうかを仕様確認する（本設計のスコープ外） |

---

## 10. 懸念事項・リスク

- **`BatchRunTab` での変数置換未適用**: 本設計では `ApiTester.tsx` の `handleSend` のみに変数置換を追加する。バッチ実行（`BatchRunTab`）が独自の送信ロジックを持つ場合、変数置換が適用されない。`BatchRunTab` の実装を確認し、必要に応じて `computeEffectiveVariables` / `applyVariables` を適用することを別タスクで検討する。
- **変数名の大文字・小文字**: `computeEffectiveVariables` は変数名を大文字小文字区別あり（case-sensitive）で管理する（`mergeKeyValues` が小文字正規化するヘッダーとは異なる）。仕様で言及がないため現状は区別ありとする。
- **`variables` を持たない旧 `Category` 型への参照**: TypeScript strict モードでは `category.variables` が `undefined` になる可能性はないが、実行時の旧データ対応として `category.variables ?? []` を UI 側でも使用する。
