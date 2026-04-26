# SPEC-カテゴリー配下リクエスト一括実行: Category Batch Run

> **ステータス**: 草稿
> **作成日**: 2026-04-26
> **最終更新**: 2026-04-26

---

## 1. 背景・目的

- **背景**: カテゴリーを選択したときの右ペイン（CategoryEditor）は現在「設定」のみ（Default Headers / Default Params / Inheritance Preview）を表示するが、そのカテゴリーに属するリクエストが正常に動作するかを一画面で確認する手段がない。API の一括ヘルスチェックや、環境切り替え後のスモークテストを手作業で行う必要があり、リクエスト数が多いほどコストが高い。
- **目的**: CategoryEditor にバッチ実行タブを追加し、選択カテゴリー配下の全リクエストをワンクリックで実行して成功 / 失敗を一覧表示できるようにする。
- **スコープ（含むもの）**:
  - CategoryEditor への新タブ「Batch Run」の追加
  - 選択カテゴリー直属リクエストの一括実行
  - 子カテゴリー配下のリクエストを含む再帰的一括実行（オプション切替）
  - カテゴリー継承（`computeEffectiveValues`）を適用した実行
  - 成功 / 失敗 / 実行中の状態を行ごとに表示
  - 実行結果サマリー（成功数 / 失敗数 / 合計数）の表示
- **スコープ（含まないもの）**:
  - 実行結果の永続化（IndexedDB への保存は行わない）
  - 個別リクエストのレスポンスボディ詳細表示（ResponsePanel の流用は対象外）
  - 実行順序のカスタマイズ
  - スケジュール実行・定期実行
  - 成功判定のカスタマイズ（閾値変更など）
  - 並列実行数の設定 UI

---

## 2. 機能要件

### 2.1 必須要件（Must Have）

- [ ] CategoryEditor のタブ一覧に「Batch Run」タブが追加される
- [ ] 「Batch Run」タブ内に「Run All」ボタンが表示される
- [ ] Run All ボタン押下で、選択カテゴリー直属の全 `SavedRequest` を順番に実行する
- [ ] 各リクエストの実行に際して `computeEffectiveValues` を適用し、カテゴリー継承済みのヘッダー・パラメータを使用する
- [ ] リクエストは `/api/proxy` 経由で送信する（直接 `fetch` 不可）
- [ ] 実行中のリクエストは「Running」ステータスで表示し、完了後に結果へ更新する
- [ ] HTTP 2xx を成功、それ以外（4xx / 5xx / ネットワークエラー）を失敗と判定する
- [ ] 各行に `METHOD`・リクエスト名・URL・ステータスコード（または「Error」）・レスポンスタイムを表示する
- [ ] 全実行完了後に「N passed / M failed」のサマリーを表示する
- [ ] Run All の実行中は再度 Run All を押せないようにボタンを無効化する
- [ ] 実行中に個別リクエストの結果が順次更新される（全完了を待たない）

### 2.2 推奨要件（Should Have）

- [ ] 「Include subcategories」チェックボックスを設け、ON 時は子カテゴリー配下のリクエストも再帰的に実行する
- [ ] リクエストが 0 件の場合は「No requests in this category」と空状態メッセージを表示する
- [ ] 失敗行をハイライト（赤系）、成功行を緑系で色分けする
- [ ] 実行結果の各行をクリックすると、そのリクエストが左ペインで選択状態になる
- [ ] 実行完了後、「Run All」ボタンが「Re-run」に変わり再実行できる

### 2.3 将来対応（Nice to Have）

- [ ] 失敗したリクエストのみ再実行する「Retry Failed」ボタン
- [ ] レスポンスボディのワンライン要約（最初の 100 文字）を行に表示する
- [ ] 実行結果を CSV / JSON でエクスポートする
- [ ] 並列実行モード（リクエスト数が多い場合の高速化）

---

## 3. 非機能要件

- **パフォーマンス**: リクエストは逐次実行（1件ずつ）とし、前のリクエスト完了後に次を開始する。1件あたりのタイムアウトは 30 秒とする（`/api/proxy` の既存タイムアウト設定に従う）。
- **セキュリティ**: 送信するリクエスト内容はユーザーが登録済みの `SavedRequest` のみとし、外部入力を直接実行しない。XSS 対策として、レスポンスボディを表示する際は HTML エスケープを行う（ステータスコード・レスポンスタイムは数値のみ表示するため問題なし）。
- **アクセシビリティ**: Run All ボタンはキーボードフォーカス可能とし、`aria-disabled` で無効状態を通知する。実行中のローダーには `role="status"` を付与する。
- **ブラウザ対応**: Chrome / Firefox / Safari 最新版
- **状態管理**: `useState` / `useEffect` のみ使用。外部状態管理ライブラリは導入しない。

---

## 4. UI/UX 設計

### 4.1 画面レイアウト

CategoryEditor 右ペインのタブ構成が以下のように変わる：

```
[ Default Headers ] [ Default Params ] [ Inheritance Preview ] [ Batch Run ]  ← タブ追加
──────────────────────────────────────────────────────────────────────────────
[ Include subcategories □ ]                       [ ▶ Run All         ]
──────────────────────────────────────────────────────────────────────────────
  METHOD   Name                URL                Status   Time
  ───────────────────────────────────────────────────────────────────
  GET      Get Users           /api/users          200 OK   123 ms    ✅
  POST     Create User         /api/users          201 OK    87 ms    ✅
  DELETE   Delete User         /api/users/1        404 …    210 ms    ❌
  GET      Health Check        /api/health         —        —         ⏳  ← 実行中
──────────────────────────────────────────────────────────────────────────────
  サマリー（全完了後）:   2 passed  /  1 failed  /  4 total
```

### 4.2 ユーザー操作フロー

1. ユーザーが左ペインのカテゴリーを選択する
2. 右ペインの「Batch Run」タブをクリックする
3. 必要に応じて「Include subcategories」チェックを ON にする
4. 「Run All」ボタンを押す
5. リクエスト一覧が表示され、上から順に実行状態が「Running（⏳）」→「成功（✅）or 失敗（❌）」に更新される
6. 全件完了後にサマリーが表示される
7. 任意のリクエスト行をクリックすると、左ペインでそのリクエストが選択される（推奨要件）

### 4.3 実行前の空状態

- リクエストが 0 件の場合: 「No requests in this category」メッセージを中央表示
- まだ「Run All」を押していない場合: リクエスト名と URL の一覧のみ表示し、ステータス列は「—」

### 4.4 エラーハンドリング

| エラー条件 | 表示 | 対処方法 |
|-----------|------|---------|
| ネットワークエラー / タイムアウト | ステータス列に「Error」、行を赤系でハイライト | 失敗扱いでカウント、次のリクエストへ進む |
| URL が空のリクエスト | ステータス列に「Skipped」、行をグレーで表示 | スキップ扱いでカウント対象外 |
| `/api/proxy` が `error` フィールドを返した場合 | ステータス列に「Error」 | 失敗扱い |
| カテゴリーに属するリクエストが 0 件 | 空状態メッセージ表示 | Run All ボタンを非表示または無効化 |

---

## 5. API 設計

### 5.1 内部 API ルート（Next.js API Routes）

既存の `POST /api/proxy` をそのまま利用する。新規 API ルートの追加はない。

**リクエスト形式（既存）**:
```json
{
  "method": "GET",
  "url": "https://example.com/api/users",
  "headers": { "Authorization": "Bearer ..." },
  "body": "..."
}
```

**レスポンス形式（既存）**:
```json
{
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "body": "...",
  "responseTime": 123,
  "size": 456,
  "error": null
}
```

---

## 6. データモデル変更

### 6.1 型定義の変更

`lib/types.ts` への追加（新規型のみ、既存型の変更なし）：

```typescript
// バッチ実行における個別リクエストの実行結果
export type BatchRunStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped';

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

### 6.2 永続化

バッチ実行結果は **IndexedDB / localStorage に保存しない**。`CategoryEditor` コンポーネント内の `useState` のみで管理し、タブ切り替えまたはカテゴリー切り替え時にリセットされる。

### 6.3 マイグレーション

既存データへの影響なし。

---

## 7. 実装指針

### 7.1 コンポーネント構成

```
CategoryEditor.tsx
  ├─ tabs: [...既存タブ, 'Batch Run']
  └─ BatchRunTab（新コンポーネント: components/BatchRunTab.tsx）
       ├─ props:
       │    category: Category
       │    categories: Category[]
       │    requests: SavedRequest[]
       │    onSelectRequest: (id: string) => void   // 行クリック時に左ペイン選択
       └─ state:
            results: BatchRunResult[]
            running: boolean
            includeSubcategories: boolean
```

### 7.2 リクエスト収集ロジック（疑似コード）

```typescript
function collectRequests(
  categoryId: string,
  allRequests: SavedRequest[],
  allCategories: Category[],
  includeSubcategories: boolean
): SavedRequest[] {
  const direct = allRequests.filter(r => r.categoryId === categoryId);
  if (!includeSubcategories) return direct;

  const children = allCategories.filter(c => c.parentId === categoryId);
  const childRequests = children.flatMap(c =>
    collectRequests(c.id, allRequests, allCategories, true)
  );
  return [...direct, ...childRequests];
}
```

### 7.3 実行ロジック（疑似コード）

```typescript
async function runAll() {
  setRunning(true);
  const targets = collectRequests(...);
  setResults(targets.map(r => ({ requestId: r.id, status: 'pending', ... })));

  for (const req of targets) {
    setResults(prev => prev.map(r =>
      r.requestId === req.id ? { ...r, status: 'running' } : r
    ));

    if (!req.request.url.trim()) {
      setResults(prev => prev.map(r =>
        r.requestId === req.id ? { ...r, status: 'skipped' } : r
      ));
      continue;
    }

    try {
      const { headers, params } = computeEffectiveValues(
        req.request.headers, req.request.params, req.categoryId, categories
      );
      // Build URL, headers, call /api/proxy ...
      const data = await fetch('/api/proxy', { method: 'POST', ... }).then(r => r.json());
      const isSuccess = data.status >= 200 && data.status < 300;
      setResults(prev => prev.map(r =>
        r.requestId === req.id
          ? { ...r, status: isSuccess ? 'success' : 'failure',
              httpStatus: data.status, responseTime: data.responseTime, ... }
          : r
      ));
    } catch (e) {
      setResults(prev => prev.map(r =>
        r.requestId === req.id ? { ...r, status: 'failure', error: String(e) } : r
      ));
    }
  }
  setRunning(false);
}
```

---

## 8. 受け入れ条件

以下をすべて満たすことでリリース可能とする。

- [ ] **AC1**: CategoryEditor に「Batch Run」タブが表示され、クリックで切り替わること
- [ ] **AC2**: 「Run All」ボタンを押すと、選択カテゴリー直属の全リクエストが上から順に実行されること
- [ ] **AC3**: 各リクエストの実行中は「Running」状態が表示され、完了後にステータスコードが表示されること
- [ ] **AC4**: HTTP 200〜299 は成功（✅）、それ以外は失敗（❌）と判定されること
- [ ] **AC5**: ネットワークエラー発生時も他のリクエストの実行が継続し、エラー行は「Error」と表示されること
- [ ] **AC6**: 全件完了後に「N passed / M failed」サマリーが表示されること
- [ ] **AC7**: 実行中は「Run All」ボタンが無効化（クリック不可）になること
- [ ] **AC8**: カテゴリー継承（親カテゴリーのデフォルトヘッダー）が実行時に適用されること（`computeEffectiveValues` を通じて）
- [ ] **AC9**: URL が空のリクエストはスキップされ、サマリーのカウントに含まれないこと
- [ ] **AC10**: リクエストが 0 件のカテゴリーでは空状態メッセージが表示されること
- [ ] **AC11**: 「Include subcategories」チェックを ON にすると、子カテゴリーのリクエストも実行対象に含まれること
- [ ] **AC12**: 既存タブ（Default Headers / Default Params / Inheritance Preview）の動作が変わらないこと（リグレッションなし）

---

## 9. 対象外（スコープ外）

- バッチ実行結果の永続化（IndexedDB への保存は行わない）
- レスポンスボディの詳細表示（ボディ表示は ResponsePanel の責務）
- 並列実行（常に逐次実行）
- 実行順序のカスタマイズ
- 成功判定閾値の変更（常に 2xx = 成功）
- スケジュール実行・定期実行
- 結果のエクスポート（CSV / JSON）

---

## 10. 備考・制約

- **依存する既存機能**: カテゴリー継承（`lib/inheritance.ts`）、CORS プロキシ（`app/api/proxy/route.ts`）、IndexedDB ストレージ（`lib/storage.ts`）
- **既存コンポーネントへの影響**:
  - `CategoryEditor.tsx`: タブ追加・`requests` prop と `onSelectRequest` prop を新たに受け取る必要がある
  - `ApiTester.tsx`: `CategoryEditor` に `requests` と `onSelectRequest` を渡す props 追加が必要
- **既知の制約**: `/api/proxy` はサーバーサイド（Next.js API Route）で動作するため、ブラウザの fetch でアクセスできる環境（`localhost` または Vercel デプロイ済み環境）が必要
- **参考**: `SPEC-カテゴリー複製.md`（カテゴリーツリー操作パターンの参考）
