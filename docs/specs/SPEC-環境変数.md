# SPEC-環境変数: Category Variables（カテゴリー変数）

> **ステータス**: 草稿  
> **作成日**: 2026-04-27  
> **最終更新**: 2026-04-27

---

## 1. 背景・目的

- **背景**: URL・ヘッダー・パラメータに繰り返し登場するホスト名や API キーなどを、各リクエストに手書きしている。環境（開発/本番など）を切り替えるたびに全リクエストを書き直す必要があり、作業コストが高い。
- **目的**: カテゴリーに変数（キーと値のペア）を定義し、URL・ヘッダー値・パラメータ値・リクエストボディ中で `${変数名}` 構文を使って参照できるようにする。カテゴリー継承と組み合わせることで、ツリー上位で定義した変数を子カテゴリーのリクエストでも自動的に利用できる。
- **スコープ（含むもの）**:
  - `Category` 型への `variables: KeyValuePair[]` フィールド追加
  - カテゴリー継承チェーンを使った変数解決（子カテゴリーが優先）
  - 変数置換の適用対象: URL 文字列・ヘッダー値・クエリパラメータ値・リクエストボディ
  - `CategoryEditor` Settings タブへの「Variables」セクション追加
  - `lib/inheritance.ts` への変数解決関数 `computeEffectiveVariables()` 追加
  - 既存 IndexedDB データとの後方互換マイグレーション
- **スコープ（含まないもの）**:
  - グローバル（カテゴリー非依存）な環境変数
  - 複数の「環境プロファイル」切り替え機能
  - 変数値の暗号化・マスキング表示
  - レスポンス値を変数に代入するダイナミック変数
  - ヘッダーキー・パラメータキー への `${変数名}` 適用（値のみ対象）

---

## 2. ユーザーストーリー

| # | ストーリー |
|---|-----------|
| US-1 | カテゴリー編集画面で `HOST = test.co.jp` のような変数を追加・編集・削除できる。 |
| US-2 | リクエストの URL に `http://${HOST}/api/users` と入力すると、送信時に `http://test.co.jp/api/users` に展開される。 |
| US-3 | 親カテゴリーで定義した変数 `TOKEN = abc123` を、子カテゴリーのリクエストのヘッダー値 `Bearer ${TOKEN}` でそのまま利用できる。 |
| US-4 | 子カテゴリーが同名の変数 `HOST = staging.co.jp` を持つ場合、子の値 `staging.co.jp` が優先される。 |
| US-5 | 変数が未定義の場合、`${UNDEFINED_VAR}` はそのままの文字列として送信される（エラーにならない）。 |

---

## 2. 機能要件

### 2.1 必須要件（Must Have）

- [ ] `Category` 型に `variables: KeyValuePair[]` フィールドを追加する
- [ ] `CategoryEditor` の Settings タブに「Variables」セクションを追加し、`KeyValueTable` で変数の追加・編集・削除・有効/無効切り替えができる
- [ ] カテゴリー継承チェーンを走査して変数マップを解決する `computeEffectiveVariables()` 関数を `lib/inheritance.ts` に追加する
  - 優先度: **直近（immediate）カテゴリー > 中間カテゴリー > ルートカテゴリー**（`enabled: false` のエントリは除外）
- [ ] リクエスト送信時（`handleSend`）に `computeEffectiveVariables()` で変数マップを取得し、以下の文字列に `${KEY}` → 対応値の置換を適用する
  - URL 文字列（パラメータ展開・URL パースより前に適用）
  - ヘッダーの値（value）
  - クエリパラメータの値（value）
  - リクエストボディ文字列
- [ ] 変数が未定義の場合は `${変数名}` のまま送信する（サイレントパス）
- [ ] 既存 IndexedDB データの `categories` レコードに `variables` フィールドがない場合、読み込み時に `variables: []` へ自動補完する（マイグレーション）
- [ ] 変数変更は即時 IndexedDB へ保存される（他の Category フィールド変更と同等の挙動）

### 2.2 推奨要件（Should Have）

- [ ] CategoryEditor の Inheritance Preview に「Variables」列を追加し、各レベルの変数を一覧表示する
- [ ] 変数置換後の URL を `ResponseState.sentUrl` に記録し、レスポンスパネルに表示する（既存の `sentUrl` の挙動を維持）
- [ ] `KeyValueTable` の value 入力欄のプレースホルダーを `Value` のままとし、key 欄は `Variable name` とする

### 2.3 将来対応（Nice to Have）

- [ ] グローバル環境変数（カテゴリー非依存）の管理画面
- [ ] 複数環境プロファイル（dev / staging / prod）の切り替え
- [ ] 変数値のマスキング表示（シークレット変数対応）
- [ ] URL バーやリクエストパネルでの `${変数名}` ハイライト表示

---

## 3. 非機能要件

- **パフォーマンス**: 変数置換処理（正規表現による一括置換）は同期処理で完結し、送信レイテンシに加算される時間は 5ms 以内とする
- **セキュリティ**: 変数値は IndexedDB に平文保存されることをドキュメントで明示する。API キー等の機密情報をブラウザストレージに保存するリスクはユーザー自身が判断する
- **セキュリティ（XSS）**: 変数値はリクエスト送信文字列にのみ展開し、DOM へ直接挿入しない。`KeyValueTable` の入力は React の制御コンポーネントとして扱い、`dangerouslySetInnerHTML` は使用しない
- **アクセシビリティ**: `KeyValueTable` の再利用により既存の Keyboard 操作対応を引き継ぐ
- **ブラウザ対応**: Chrome 最新版・Firefox 最新版・Safari 最新版

---

## 4. UI/UX 設計

### 4.1 CategoryEditor Settings タブ（変更後）

```
┌─────────────────────────────────────────────────────────┐
│ [Settings] [Batch Run]                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  VARIABLES                                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ☑ HOST          test.co.jp                  [x] │   │
│  │ ☑ API_KEY       secret123                   [x] │   │
│  │ +  Add Variable                                  │   │
│  └──────────────────────────────────────────────────┘   │
│  ℹ Use ${VARIABLE_NAME} in URL, headers, params, body.  │
│    Child category values take precedence over parents.  │
│                                                         │
│  DEFAULT HEADERS                                        │
│  ...（既存）                                            │
│                                                         │
│  DEFAULT PARAMETERS                                     │
│  ...（既存）                                            │
│                                                         │
│  INHERITANCE PREVIEW                                    │
│  ...（既存。Variables 列を追加）                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.2 ユーザー操作フロー

1. ユーザーがカテゴリーを選択し、Settings タブを開く
2. 「Variables」セクションの「+ Add Variable」をクリックする
3. `KeyValueTable` に新しい行が追加される
4. キー欄に変数名（例: `HOST`）、値欄に値（例: `test.co.jp`）を入力する
5. 変更が即時保存される
6. ユーザーがリクエストを選択し、URL 欄に `http://${HOST}/api` と入力する
7. 「Send」ボタンを押すと、`http://test.co.jp/api` として送信される
8. レスポンスパネルの Sent URL に置換後の URL が表示される

### 4.3 Inheritance Preview における Variables 表示

各カテゴリーカードに「Variables」列を追加し、`KVSummary` と同じスタイルで表示する:

```
┌─────────────────── Root ────────────────────────────┐
│  Headers: Authorization: Bearer ${TOKEN}            │
│  Params:  (none)                                    │
│  Variables: HOST: prod.example.com                  │
│             TOKEN: abc123                           │
└─────────────────────────────────────────────────────┘
    ↓ (child overrides)
┌─────────────── My API Category ─────────────────────┐
│  Headers: (none)                                    │
│  Params:  (none)                                    │
│  Variables: HOST: staging.example.com  ← 上書き     │
└─────────────────────────────────────────────────────┘
```

### 4.4 エラーハンドリング

| エラー条件 | 挙動 |
|-----------|------|
| 未定義変数 `${UNKNOWN}` を含む URL でリクエスト送信 | 置換せず `${UNKNOWN}` のまま送信する（エラーなし、サイレント） |
| 変数名にスペースや特殊文字（`${MY VAR}` 等） | `${MY VAR}` に一致する変数が存在しない限り置換されない（仕様通り） |
| IndexedDB 書き込みエラー | コンソールにエラーを出力する（他の Category 変更と同等の挙動） |

---

## 5. API 設計

この機能は完全にクライアントサイドで完結するため、新規 Next.js API Route の追加は不要。
変数置換後のリクエストは既存の `/api/proxy` を経由して送信される。

---

## 6. データモデル変更

### 6.1 `lib/types.ts` — `Category` 型の変更

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

### 6.2 マイグレーション方針

IndexedDB から読み込んだ `Category` オブジェクトに `variables` フィールドがない場合（旧データ）、`lib/storage.ts` の `getCategories()` 内で `variables: []` を補完する。

```typescript
// lib/storage.ts の getCategories() 内
return raw.map((c: Category) => ({
  variables: [],   // デフォルト値（旧データ互換）
  ...c,
}));
```

localStorage から IndexedDB へのマイグレーションパス（`migrateFromLocalStorage`）についても、読み込んだカテゴリーデータに同様の補完を適用する。

### 6.3 `lib/inheritance.ts` への関数追加

```typescript
/**
 * Resolve the effective variable map for a given category,
 * merging the ancestor chain with child-wins priority.
 *
 * Priority: immediate category > middle > root category (child wins)
 * Disabled (enabled: false) variables are excluded.
 *
 * @returns Map of variable name → value
 */
export function computeEffectiveVariables(
  categoryId: string | null,
  categories: Category[]
): Map<string, string> {
  const chain = buildCategoryChain(categoryId, categories);
  // chain is [immediate, ..., root]. Root is weakest for variables too.
  // Iterate root→immediate so that immediate overwrites root.
  const result = new Map<string, string>();
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

/**
 * Replace all ${KEY} placeholders in `input` using the provided variable map.
 * Unresolved placeholders are left as-is.
 */
export function applyVariables(input: string, variables: Map<string, string>): string {
  return input.replace(/\$\{([^}]+)\}/g, (match, key) => variables.get(key) ?? match);
}
```

### 6.4 `components/ApiTester.tsx` の `handleSend` 変更

変数置換を URL パース・パラメータ展開の前に挿入する:

```typescript
// 既存コード（抜粋）
const categoryId = selectedRequest?.categoryId ?? null;
const { headers: effectiveHeaders, params: effectiveParams } = computeEffectiveValues(
  editingRequest.headers,
  editingRequest.params,
  categoryId,
  categories,
);

// ── 追加: 変数置換 ──────────────────────────────────────────
const variables = computeEffectiveVariables(categoryId, categories);

const resolvedUrl = applyVariables(editingRequest.url, variables);
const resolvedHeaders = effectiveHeaders.map(h => ({ ...h, value: applyVariables(h.value, variables) }));
const resolvedParams  = effectiveParams.map(p => ({ ...p, value: applyVariables(p.value, variables) }));
const resolvedBody    = editingRequest.body ? applyVariables(editingRequest.body, variables) : editingRequest.body;
// ────────────────────────────────────────────────────────────

// 以降、resolvedUrl / resolvedHeaders / resolvedParams / resolvedBody を使用する
// （既存の editingRequest.url, effectiveHeaders 等を置き換える）
```

### 6.5 `components/CategoryEditor.tsx` の変更

Settings タブの `defaultHeaders` セクションの前に「Variables」セクションを追加する:

```tsx
<section>
  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Variables</h3>
  <div className="flex items-start gap-2 mb-4 bg-indigo-500/5 border border-indigo-500/20 rounded-lg px-3 py-2.5 text-xs text-slate-400">
    <Info size={14} className="mt-0.5 flex-shrink-0 text-indigo-400" />
    <span>
      Use <code className="font-mono text-indigo-300">{'${VARIABLE_NAME}'}</code> in URL, headers,
      params, and body. Child category values take precedence over parent values.
    </span>
  </div>
  <KeyValueTable
    pairs={category.variables}
    onChange={newPairs => onChange({ ...category, variables: newPairs })}
    showEnabled={true}
    keyPlaceholder="Variable name"
    valuePlaceholder="Value"
  />
</section>
```

---

## 7. 受け入れ条件

以下をすべて満たすことでリリース可能とする。

- [ ] **AC-1**: カテゴリー編集画面の Settings タブに「Variables」セクションが表示され、`KeyValueTable` で行の追加・編集・削除・有効/無効切り替えができる
- [ ] **AC-2**: 変数 `HOST = test.co.jp` を設定したカテゴリーのリクエストで URL `http://${HOST}/path` を送信すると、実際の送信 URL が `http://test.co.jp/path` になる（`sentUrl` で確認）
- [ ] **AC-3**: ヘッダー値 `Bearer ${TOKEN}`、パラメータ値 `${PAGE}`、ボディ `{"env": "${ENV}"}` に対しても変数置換が適用される
- [ ] **AC-4**: 親カテゴリーで `HOST = prod.co.jp`、子カテゴリーで `HOST = staging.co.jp` を定義した場合、子カテゴリーのリクエストでは `staging.co.jp` が使用される
- [ ] **AC-5**: 親カテゴリーのみで定義した変数 `TOKEN` を子カテゴリーのリクエストでも参照でき、正しく置換される
- [ ] **AC-6**: 未定義変数 `${UNKNOWN_VAR}` を含む URL でリクエストを送信しても、エラーが発生せず `${UNKNOWN_VAR}` のまま送信される
- [ ] **AC-7**: 旧データ（`variables` フィールドなし）の Category を IndexedDB から読み込んでも、アプリがクラッシュせず正常に動作する
- [ ] **AC-8**: 変数の `enabled` を `false` にすると置換対象から除外される
- [ ] **AC-9**: 既存の Default Headers・Default Parameters・Batch Run 機能が引き続き正常に動作する（リグレッションなし）

---

## 8. 備考・制約

- **依存する他機能**: カテゴリー継承（`lib/inheritance.ts`）。`buildCategoryChain()` を再利用する
- **変数の優先度**: ヘッダー・パラメータ継承と同じく「直近カテゴリー > 中間 > ルート」。コード上の `mergeKeyValues()` の動作と統一する
- **置換タイミング**: 変数は送信直前（`handleSend` 内）にのみ展開される。編集中の URL 欄には `${変数名}` がそのまま表示される（エディタに展開後の値は反映しない）
- **変数名の大文字・小文字**: 大文字・小文字を区別する（`${HOST}` と `${host}` は別変数）。`mergeKeyValues` がキーを小文字化しているのと異なる点に注意
- **既知の制約**: ブラウザの IndexedDB はオリジン単位で分離されるが、変数値（API キー等）を平文保存するリスクが存在する。将来的な暗号化対応は「将来対応」スコープとする
- **参考仕様**: SPEC-カテゴリー複製.md（`variables` フィールドの複製対象への追加が必要）
