# SPEC-インライン名前変更とリクエストソート: Inline Rename & Name-order Sort

> **ステータス**: 草稿  
> **作成日**: 2026-04-28  
> **最終更新**: 2026-04-28

---

## 1. 背景・目的

- **背景**:
  - カテゴリー名の変更には現状ツールバーの Edit2 ボタンを押す必要があり、操作に余計なステップが発生する。
  - リクエスト行には名前変更 UI が存在しない（削除のみ）。
  - カテゴリー・リクエストの表示順は登録順（`createdAt` 降順）であり、目的のリクエストを探しにくい。
- **目的**:
  - カテゴリー名・リクエスト名をダブルクリック 1 操作でその場（インライン）で変更できるようにする。
  - 左ペインのカテゴリー・リクエストを名前の昇順（ロケール対応アルファベット・五十音順）で表示する。
- **スコープ（含むもの）**:
  - `CategoryTree.tsx` 内 `CategoryNode` へのダブルクリックトリガー追加（カテゴリー）
  - `CategoryTree.tsx` 内 `RequestRow` へのインライン編集 UI 追加（リクエスト）
  - `CategoryTree.tsx` 内の子カテゴリー・リクエストの名前順ソート
  - `ApiTester.tsx` への `handleRenameRequest` コールバック追加と `onRenameRequest` prop 伝搬
- **スコープ（含まないもの）**:
  - ドラッグ＆ドロップによる並び替え
  - ソート順のカスタマイズ（降順・登録順に切り替えるオプション等）
  - カテゴリー名変更操作の Undo / Redo
  - IndexedDB の `createdAt` 順取得ロジックの変更（`getCategories` / `getSaved` の返却順は変えない）
  - `Sidebar.tsx` の履歴セクションへのソート適用

---

## 2. 機能要件

### 2.1 必須要件（Must Have）

#### 機能1: 名前順ソート

- [ ] `CategoryNode` 内で子カテゴリーを `name` の `localeCompare` 昇順に並べて表示する
- [ ] `CategoryNode` 内で子リクエストを `name` の `localeCompare` 昇順に並べて表示する
- [ ] ルートレベルのカテゴリー一覧も同様に名前順ソートして表示する
- [ ] ソートは表示のみとし、IndexedDB の保存データの順序は変更しない

#### 機能2: ダブルクリックによるインライン名前変更（カテゴリー）

- [ ] カテゴリー名テキストをダブルクリックすると、既存のインライン編集 input が起動する（`renamingId` を自カテゴリーの id にセットする）
- [ ] ダブルクリックで編集開始した場合もツールバーの Edit2 ボタン経由と同じ挙動になる
- [ ] Enter キーで新しい名前を確定し、IndexedDB に永続化する
- [ ] Escape キーで元の名前に戻してキャンセルする
- [ ] 空文字・空白文字のみで Enter を押した場合はキャンセル扱いとし、元の名前を保持する
- [ ] `onBlur` 時も確定処理を行う（既存動作を維持）

#### 機能2: ダブルクリックによるインライン名前変更（リクエスト）

- [ ] リクエスト名テキストをダブルクリックすると、インライン編集 input に切り替わる
- [ ] Enter キーで新しい名前を確定し、`updateSavedRequest(id, { name })` で IndexedDB に永続化する
- [ ] Escape キーでキャンセルし、元の名前に戻す
- [ ] 空文字・空白文字のみで Enter を押した場合はキャンセル扱いとし、元の名前を保持する
- [ ] `onBlur` 時も確定処理を行う
- [ ] 確定後、親コンポーネントのリクエスト一覧ステートが再フェッチされ、UI が更新される

### 2.2 推奨要件（Should Have）

- [ ] インライン編集 input 開始時に既存の名前が全選択状態になる（即座に上書き入力できる）
- [ ] 編集中は行の他の要素（選択・削除ボタン等）へのクリックを無効化する
- [ ] ダブルクリックで発生するテキスト選択（ブラウザのデフォルト動作）を `preventDefault` で抑制する

### 2.3 将来対応（Nice to Have）

- [ ] ソート順トグルボタン（名前順 ⇔ 登録順）の追加
- [ ] 複製直後に名前をインライン編集状態で開始する（SPEC-カテゴリー複製 の Nice to Have）

---

## 3. 非機能要件

- **パフォーマンス**: 1000 件のリクエストを含むカテゴリーのソートと再描画が 100ms 以内に完了すること（ソートは描画ごとに実行されるため `useMemo` 等を検討する）
- **セキュリティ**: インライン編集で入力された名前は React の JSX テキストノードとして表示され、innerHTML は使用しない（XSS 対策済み）
- **アクセシビリティ**:
  - インライン編集 input に `aria-label="カテゴリー名を変更"` / `"リクエスト名を変更"` を付与する
  - キーボード操作（Tab フォーカス → Enter で確定、Escape でキャンセル）が機能すること
- **ブラウザ対応**: Chrome 最新版・Firefox 最新版・Safari 最新版

---

## 4. UI/UX 設計

### 4.1 ソート後のツリー表示イメージ

```
▼ Auth          ← アルファベット昇順
  ▼ OAuth2      ← サブカテゴリーも名前順
      GET  authorization
      POST token
  ▼ Basic
      GET  check
▼ Users
  DELETE delete-user
  GET  get-user
  POST create-user
```

### 4.2 カテゴリーのインライン編集フロー

1. ユーザーがカテゴリー名テキストをダブルクリックする
2. テキストが `<input>` に置き換わり、現在の名前が全選択状態でフォーカスされる
3. ユーザーが新しい名前を入力し、Enter を押す
4. システムが `onRenameCategory(id, newName)` を呼び出し、IndexedDB を更新する
5. カテゴリー一覧が再フェッチされ、ツリーが更新される（名前順に再ソートされる）

キャンセル時:
- Escape キー押下 → 元の名前に戻り、input が非表示になる
- 空文字で Enter → 同上

### 4.3 リクエストのインライン編集フロー

1. ユーザーがリクエスト名テキストをダブルクリックする
2. テキストと HTTP メソッドバッジが非表示になり、`<input>` が表示されてフォーカスされる
3. ユーザーが新しい名前を入力し、Enter を押す
4. システムが `onRenameRequest(id, newName)` を呼び出し、`updateSavedRequest` で IndexedDB を更新する
5. リクエスト一覧が再フェッチされ、ツリーが更新される（名前順に再ソートされる）

### 4.4 リクエスト行の編集中レイアウト

通常時:
```
[FileJson][METHOD] リクエスト名テキスト        [削除]
```

編集中:
```
[FileJson][─────────── input ────────────────────]
```

- input は行の残り幅すべてを占有する
- 削除ボタンは editing 中は非表示にする

### 4.5 エラーハンドリング

| エラー条件 | 挙動 |
|-----------|------|
| IndexedDB 書き込みエラー（rename） | コンソールにエラー出力。UI は変更前の状態に戻す |
| 空文字 / 空白のみで確定 | キャンセル扱い（元の名前を保持） |
| ダブルクリック中に別の行をクリック | `onBlur` で現在の編集を確定する |

---

## 5. API 設計

内部完結のため新規 API Route の追加は不要。

---

## 6. データモデル変更

### 6.1 型定義変更

なし。`Category.name` / `SavedRequest.name` は既存フィールド。

### 6.2 `lib/storage.ts` への追加

`updateCategory` 関数を追加する（`updateSavedRequest` と同パターン）:

```typescript
export async function updateCategory(id: string, updates: Partial<Category>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('categories', 'readwrite');
  const store = tx.objectStore('categories');
  const existing = await idbReq<Category | undefined>(store.get(id));
  if (existing) store.put({ ...existing, ...updates });
  await txDone(tx);
}
```

> **補足**: 現状は `handleRenameCategory` が `getCategories()` + `saveCategory()` で更新しているが、`updateCategory` を使う方式に統一することを推奨する。ただし既存の `handleRenameCategory` のリファクタリングはこの仕様のスコープ外とし、新規の `handleRenameRequest` で `updateSavedRequest` を使う実装を基準とする。

### 6.3 `components/CategoryTree.tsx` への変更

#### `CategoryTreeProps` への prop 追加

```typescript
interface CategoryTreeProps {
  // ... 既存 props ...
  onRenameRequest: (id: string, newName: string) => void;  // 追加
}
```

#### `RequestRowProps` への prop 追加

```typescript
interface RequestRowProps {
  // ... 既存 props ...
  onRenameRequest: (id: string, newName: string) => void;  // 追加
  renamingRequestId: string | null;                        // 追加
  setRenamingRequestId: (id: string | null) => void;       // 追加
}
```

#### `CategoryNodeProps` への prop 追加

```typescript
interface CategoryNodeProps {
  // ... 既存 props ...
  onRenameRequest: (id: string, newName: string) => void;  // 追加
  renamingRequestId: string | null;                        // 追加
  setRenamingRequestId: (id: string | null) => void;       // 追加
}
```

### 6.4 `components/ApiTester.tsx` への変更

`handleRenameRequest` コールバックを追加し、`CategoryTree` に `onRenameRequest` として渡す:

```typescript
const handleRenameRequest = useCallback(async (id: string, newName: string) => {
  await updateSavedRequest(id, { name: newName });
  setRequests(await getSaved());
}, []);
```

### 6.5 ソートロジック

`CategoryNode` 内の子カテゴリー・子リクエストを描画前に `localeCompare` で昇順ソートする:

```typescript
const childCategories = allCategories
  .filter(c => c.parentId === category.id)
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

const childRequests = allRequests
  .filter(r => r.categoryId === category.id)
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
```

ルートレベルのカテゴリー表示も同様にソートする（`CategoryTree` コンポーネントの `rootCategories` 算出箇所）。

---

## 7. 受け入れ条件

以下をすべて満たすことでリリース可能とする。

### 機能1: 名前順ソート

- [ ] AC1-1: カテゴリーが英語名・日本語名混在の場合、ロケール対応の昇順（例: "Auth" → "Users" → "あいう" → "かきく"）で表示されること
- [ ] AC1-2: サブカテゴリーも各階層ごとに名前順ソートされること
- [ ] AC1-3: リクエストも各カテゴリー内で名前順ソートされること
- [ ] AC1-4: 新規リクエスト・カテゴリー追加後も、次の画面更新時に名前順で表示されること
- [ ] AC1-5: ソート後も IndexedDB に保存されたデータの順序が変化していないこと（`getCategories()` / `getSaved()` の返却データ確認）

### 機能2: インライン名前変更（カテゴリー）

- [ ] AC2-1: カテゴリー名テキストをダブルクリックするとインライン input が表示され、現在の名前が全選択状態になること
- [ ] AC2-2: 新しい名前を入力して Enter を押すと、ツリーに新しい名前が反映されること
- [ ] AC2-3: Enter 確定後、`CategoryTree` が更新され名前順の正しい位置に移動して表示されること
- [ ] AC2-4: Escape を押すと元の名前に戻り、input が消えること
- [ ] AC2-5: 空文字または空白のみで Enter を押した場合、元の名前が保持されること
- [ ] AC2-6: ツールバーの Edit2 ボタンによる既存のリネーム機能が引き続き動作すること

### 機能2: インライン名前変更（リクエスト）

- [ ] AC3-1: リクエスト名テキストをダブルクリックするとインライン input が表示され、現在の名前が全選択状態になること
- [ ] AC3-2: 新しい名前を入力して Enter を押すと、ツリーに新しい名前が反映されること
- [ ] AC3-3: Enter 確定後、`CategoryTree` が更新され名前順の正しい位置に移動して表示されること
- [ ] AC3-4: Escape を押すと元の名前に戻り、input が消えること
- [ ] AC3-5: 空文字または空白のみで Enter を押した場合、元の名前が保持されること
- [ ] AC3-6: リクエストの右クリック右ペイン（リクエスト内容）に表示される名前も更新されること
- [ ] AC3-7: 既存の削除機能（Trash2 ボタン）が引き続き動作すること

### リグレッション

- [ ] AC4-1: カテゴリーの追加・削除・複製機能が引き続き動作すること
- [ ] AC4-2: リクエストの追加・削除・移動機能が引き続き動作すること
- [ ] AC4-3: カテゴリーの選択・展開状態が引き続き正常に動作すること

---

## 8. 備考・制約

- **依存する他機能**: SPEC-カテゴリー複製（`CategoryNode` のホバーアクションボタン構成、`renamingId` / `setRenamingId` の既存実装を引き継ぐ）
- **既存の `renamingId` 実装について**: `CategoryNode` にはすでに `renamingId`/`setRenamingId` によるインライン編集機能が実装されている。本仕様ではその既存 UI をダブルクリックでもトリガーできるよう拡張するにとどめる。
- **既知の制約**:
  - `localeCompare` のソート順はブラウザの実装に依存する。特殊文字や絵文字を含む名前の順序は環境差異が生じる可能性がある。
  - ソートは `CategoryNode` のレンダー時に毎回実行される。大量データ（数百件）では `useMemo` によるメモ化を検討すること。
