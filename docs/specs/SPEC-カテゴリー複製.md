# SPEC-カテゴリー複製: Category Duplication

> **ステータス**: 草稿  
> **作成日**: 2026-04-26  
> **最終更新**: 2026-04-26

---

## 1. 背景・目的

- **背景**: 既存のカテゴリーを雛形として使い回したい場面がある。現在はカテゴリーを手動で再作成する必要があり、子カテゴリーやリクエストが多いほど作業コストが高くなる。
- **目的**: カテゴリーを 1 操作で複製し、設定（デフォルトヘッダー・パラメータ・説明）・子カテゴリー・リクエストをまるごとコピーできるようにする。
- **スコープ（含むもの）**:
  - 指定カテゴリーの再帰的複製（子カテゴリー・リクエストを含む全ツリー）
  - 複製ボタンの CategoryTree UI への追加
  - `lib/storage.ts` への `duplicateCategory()` 関数の追加
- **スコープ（含まないもの）**:
  - リクエスト単体の複製（対象外）
  - 異なる親カテゴリーへの複製（同じ親への複製のみ）
  - 複製後の名前をダイアログで変更する機能
  - 複製操作の Undo / Redo

---

## 2. 機能要件

### 2.1 必須要件（Must Have）

- [ ] カテゴリーツリーの各カテゴリー行にホバー時に複製ボタンが表示される
- [ ] 複製ボタンを押すと、対象カテゴリーと同じ `parentId` を持つ新規カテゴリーが作成される
- [ ] 複製されたカテゴリーの名前は `{元の名前} (copy)` となる
- [ ] 複製されたカテゴリーの `defaultHeaders`・`defaultParams`・`description` はコピーされる
- [ ] 直属の子カテゴリーが存在する場合、再帰的にすべて複製される
- [ ] 複製された各カテゴリーに属するリクエストもすべて複製される
- [ ] 複製により生成されるすべての `Category.id`・`SavedRequest.id`・`KeyValuePair.id` は `genId()` で新規生成される
- [ ] 複製後、ツリー表示は即座に更新される（UI の再フェッチ）
- [ ] 複製されたルートカテゴリーが選択状態となり、ツリーが展開される

### 2.2 推奨要件（Should Have）

- [ ] 複製処理中（IndexedDB への書き込み完了前）はボタンを無効化し、二重実行を防ぐ
- [ ] 複製に成功した際、複製先カテゴリーが自動的にスクロール表示される範囲内に入る

### 2.3 将来対応（Nice to Have）

- [ ] 複製直後に名前をインライン編集状態で開始する
- [ ] 異なる親カテゴリーへのコピー（ドラッグ＆ドロップ等との組み合わせ）

---

## 3. 非機能要件

- **パフォーマンス**: 100 件のリクエストと 10 階層のサブカテゴリーを含むカテゴリーの複製が 500ms 以内に完了すること
- **セキュリティ**: 複製されたデータは元データのディープコピーとし、元データへの参照（同一オブジェクト参照）を持たないこと
- **アクセシビリティ**: 複製ボタンに `title="Duplicate"` 属性を付与し、スクリーンリーダーで認識できること
- **ブラウザ対応**: Chrome 最新版・Firefox 最新版・Safari 最新版

---

## 4. UI/UX 設計

### 4.1 カテゴリー行のアクションボタン配置

現状のホバー時アクションボタンは左から順に:

```
[+サブカテゴリー] [+リクエスト] [リネーム] [削除]
```

複製ボタンをリネームと削除の間に追加する:

```
[+サブカテゴリー] [+リクエスト] [リネーム] [複製] [削除]
```

- アイコン: `lucide-react` の `Copy` コンポーネント（size=12）
- スタイル: 既存ボタンと統一（`p-0.5 rounded text-slate-600 hover:text-indigo-400 hover:bg-indigo-500/10`）
- `title` 属性: `"Duplicate category"`

### 4.2 ユーザー操作フロー

1. ユーザーがカテゴリー行にマウスをホバーする
2. アクションボタン群が表示される
3. ユーザーが複製ボタン（Copy アイコン）をクリックする
4. システムが対象カテゴリーを再帰的に複製し、IndexedDB へ保存する
5. `categories` / `requests` ステートが再フェッチされ、ツリーが更新される
6. 複製されたルートカテゴリー（`{元の名前} (copy)`）が選択状態となる
7. 複製されたカテゴリーのツリーが展開表示される（子がある場合）

### 4.3 命名規則

| 元の名前 | 複製後の名前 |
|---------|------------|
| `Auth` | `Auth (copy)` |
| `Auth (copy)` | `Auth (copy) (copy)` |
| `ユーザー管理` | `ユーザー管理 (copy)` |

- 名前の重複チェックは行わない（同名カテゴリーの並存を許容する）
- 子カテゴリーの名前には `(copy)` サフィックスを付与しない（ルートのみ付与）

### 4.4 エラーハンドリング

| エラー条件 | 挙動 |
|-----------|------|
| IndexedDB 書き込みエラー | エラーをコンソールに出力し、UI には通知しない（将来的に Toast 通知を追加予定） |

---

## 5. API 設計

### 5.1 内部 API ルート

複製機能は完全にクライアントサイドで完結するため、新規 API Route の追加は不要。

---

## 6. データモデル変更

### 6.1 型定義変更

型定義の変更はなし。既存の `Category` / `SavedRequest` / `KeyValuePair` 型をそのまま使用する。

### 6.2 `lib/storage.ts` への関数追加

```typescript
/**
 * 指定カテゴリーをサブカテゴリー・リクエストごと再帰的に複製する。
 * 複製されたルートカテゴリーの ID を返す。
 */
export async function duplicateCategory(sourceId: string): Promise<string> {
  const allCats = await getCategories();
  const allSaved = await getSaved();
  const source = allCats.find(c => c.id === sourceId);
  if (!source) throw new Error(`Category ${sourceId} not found`);

  // 再帰的に複製し、カテゴリーと新旧 ID マッピングを収集する
  const newCategories: Category[] = [];
  const newRequests: SavedRequest[] = [];
  const idMap = new Map<string, string>(); // oldId -> newId

  function cloneCategory(cat: Category, parentId: string | null, isRoot: boolean): string {
    const newId = genId();
    idMap.set(cat.id, newId);
    newCategories.push({
      ...cat,
      id: newId,
      parentId,
      name: isRoot ? `${cat.name} (copy)` : cat.name,
      defaultHeaders: cat.defaultHeaders.map(h => ({ ...h, id: genId() })),
      defaultParams: cat.defaultParams.map(p => ({ ...p, id: genId() })),
      createdAt: Date.now(),
    });

    // 直属リクエストを複製
    allSaved
      .filter(r => r.categoryId === cat.id)
      .forEach(r => {
        newRequests.push({
          ...r,
          id: genId(),
          categoryId: newId,
          request: {
            ...r.request,
            headers: r.request.headers.map(h => ({ ...h, id: genId() })),
            params: r.request.params.map(p => ({ ...p, id: genId() })),
          },
          createdAt: Date.now(),
        });
      });

    // 子カテゴリーを再帰複製
    allCats
      .filter(c => c.parentId === cat.id)
      .forEach(child => cloneCategory(child, newId, false));

    return newId;
  }

  const newRootId = cloneCategory(source, source.parentId, true);

  // IndexedDB への一括書き込み
  const db = await getDB(); // 内部ヘルパー（既存）
  const tx = db.transaction(['categories', 'saved'], 'readwrite');
  const catStore = tx.objectStore('categories');
  const savedStore = tx.objectStore('saved');
  for (const c of newCategories) catStore.put(c);
  for (const r of newRequests) savedStore.put(r);
  await txDone(tx);

  return newRootId;
}
```

> **注意**: `getDB`・`txDone` は `lib/storage.ts` 内部の非公開ヘルパー。`duplicateCategory` は同ファイルに追加するため直接使用可能。`genId` は `components/ApiTester.tsx` の同名ヘルパーを `lib/storage.ts` にも定義するか、別ファイルに切り出して共有する。

### 6.3 `components/CategoryTree.tsx` の変更

**`CategoryTreeProps` インターフェース**に以下を追加:

```typescript
onDuplicateCategory: (id: string) => void;
```

**`CategoryNodeProps` インターフェース**にも同様に追加し、`CategoryNode` コンポーネントのボタン群に複製ボタンを追加する。

### 6.4 `components/ApiTester.tsx` の変更

`handleDuplicateCategory` コールバックを追加し、`CategoryTree` へ `onDuplicateCategory` として渡す:

```typescript
const handleDuplicateCategory = useCallback(async (id: string) => {
  const newId = await duplicateCategory(id);
  const [updatedCats, updatedSaved] = await Promise.all([getCategories(), getSaved()]);
  setCategories(updatedCats);
  setRequests(updatedSaved);
  setSelection({ type: 'category', id: newId });
}, []);
```

### 6.5 マイグレーション方針

既存データの変更はなく、マイグレーション処理は不要。

---

## 7. 受け入れ条件

以下をすべて満たすことでリリース可能とする。

- [ ] **AC1**: 子カテゴリー・リクエストを持たないカテゴリーを複製したとき、同じ `parentId` を持つ `{元の名前} (copy)` カテゴリーが作成されること
- [ ] **AC2**: 複製されたカテゴリーの `defaultHeaders`・`defaultParams`・`description` が元カテゴリーと同じ値を持つこと
- [ ] **AC3**: 複製されたカテゴリー・リクエスト・KeyValuePair のすべての `id` が元データと異なる新規 ID であること
- [ ] **AC4**: 子カテゴリーおよびリクエストを含むカテゴリーを複製したとき、子カテゴリーとリクエストもすべて複製されること
- [ ] **AC5**: 複製後のリクエスト `categoryId` が複製されたカテゴリーの新しい ID を参照すること（元のカテゴリー ID を参照しないこと）
- [ ] **AC6**: 3 階層以上のネストを持つカテゴリーツリーを複製したとき、全階層が再帰的に複製されること
- [ ] **AC7**: 複製後にツリーが自動更新され、`{元の名前} (copy)` カテゴリーが選択状態で表示されること
- [ ] **AC8**: 複製ボタンのクリックがカテゴリーの選択・展開操作をトリガーしないこと（`e.stopPropagation()` が機能すること）
- [ ] **AC9**: 元カテゴリーのデータが複製後も変更されていないこと（副作用なし）
- [ ] **AC10**: 既存の追加・リネーム・削除機能が引き続き正常動作すること（リグレッションなし）

---

## 8. 備考・制約

- **依存機能**: SPEC-IndexedDB移行（`lib/storage.ts` の IndexedDB 実装が前提）
- **`genId` の共有**: 現在 `genId` は `components/ApiTester.tsx` にローカル定義されている。`lib/storage.ts` の `duplicateCategory` でも使用するため、`lib/utils.ts` などに切り出して共有するか、`storage.ts` 内にローカル定義する。
- **子カテゴリーの `(copy)` サフィックス**: ルートのみ `(copy)` を付与し、子カテゴリーには付与しない。これにより複製ツリー内の構造が元ツリーと同じ名前構成になる。異論がある場合は仕様見直しの余地あり。
- **既知の制約**: IndexedDB はブラウザのシークレットモードで容量制限を受ける場合がある（SPEC-IndexedDB移行 参照）
