# SPEC-レスポンスコンテンツタイプ別表示: レスポンスボディの Content-Type 別自動表示切り替え

## 1. 背景・目的

- **背景**: 現状の `ResponsePanel.tsx` は Body タブで `JsonViewer` コンポーネントのみを使用しており、JSON 以外のレスポンス（HTML, XML, 画像, プレーンテキスト等）を適切に表示できない。`ResponseState.contentType` および `ResponseState.isBinary` フィールドはすでに実装済みだが、表示ロジックで活用されていない。
- **目的**: Content-Type に応じたビューアを自動選択し、レスポンスの可読性と利便性を向上させる。HTML レスポンスはブラウザプレビューで確認でき、XML はハイライト表示され、画像は実際に表示されるようにする。
- **スコープ**:
  - **含むもの**: HTML / JSON / XML / 画像 / プレーンテキスト / バイナリの表示分岐、HTML プレビュー用の新規コンポーネント実装、XML ビューア用の新規コンポーネント実装
  - **含まないもの**: PDF レンダリング、動画・音声の再生、レスポンスのダウンロード機能、Content-Type 自動補完・上書き機能

---

## 2. 機能要件

### 2.1 必須要件（Must Have）

- [ ] Content-Type が `text/html` の場合、`sandbox` 属性付き `<iframe>` でプレビュー表示する
- [ ] HTML プレビューと HTML ソース表示を **Preview / Source** ボタンで切り替えられる
- [ ] Content-Type が `application/json` または `text/json` の場合、既存の `JsonViewer` コンポーネントを使用する（Pretty / Raw 切り替えを維持する）
- [ ] Content-Type が `text/xml`, `application/xml`, または `*+xml`（例: `application/atom+xml`）の場合、シンタックスハイライト付きで表示し、Pretty / Raw 切り替えを提供する
- [ ] Content-Type が `image/*`（例: `image/png`, `image/jpeg`, `image/gif`, `image/svg+xml`）の場合、`<img>` タグで実際の画像を表示する
- [ ] Content-Type が `text/plain` またはその他テキスト系の場合、モノスペースフォントでテキスト表示する
- [ ] `isBinary: true` かつ画像以外の場合、既存の「バイナリ / 画像レスポンス」UIを維持する
- [ ] `contentType` が `null` / `undefined` の場合、ボディ内容を解析してフォールバック表示する（JSON パース成功 → JsonViewer、それ以外 → プレーンテキスト）

### 2.2 推奨要件（Should Have）

- [ ] 各ビューアに **コピーボタン** を設け、1クリックでボディ内容をクリップボードにコピーできる
- [ ] HTML iframe のサイズが小さい場合でもスクロール可能にする
- [ ] XML の Pretty 表示はインデント幅 2 スペース相当に整形する

### 2.3 将来対応（Nice to Have）

- [ ] Markdown（`text/markdown`）のプレビューレンダリング
- [ ] CSV（`text/csv`）のテーブル表示
- [ ] Base64 エンコードされた画像（`data:image/...`）のインライン表示

---

## 3. 非機能要件

- **セキュリティ**:
  - HTML プレビュー用 `<iframe>` には必ず `sandbox="allow-same-origin"` のみを設定し、スクリプト実行（`allow-scripts`）・フォーム送信（`allow-forms`）・外部ナビゲーション（`allow-top-navigation`）を禁止する
  - iframe に表示するコンテンツは Blob URL（`URL.createObjectURL`）経由で読み込み、外部リソースへの直接参照を防ぐ
  - XML / HTML のシンタックスハイライトに `dangerouslySetInnerHTML` を使用する場合、タグ挿入前にコンテンツを必ず HTML エスケープ処理する
- **パフォーマンス**: ボディが 1 MB 以下の場合、表示切り替えを 200ms 以内に完了する
- **アクセシビリティ**: Preview / Source / Pretty / Raw の切り替えボタンは `aria-pressed` 属性でアクティブ状態を伝達する
- **ブラウザ対応**: Chrome / Firefox / Safari 最新版
- **ダークテーマ**: ベース背景 `#080c14`、サーフェス `#0d1117`、アクセント `indigo-500` を維持する。新規コンポーネントでライトカラー背景色は使用しない

---

## 4. UI/UX 設計

### 4.1 コンテンツタイプ別の表示仕様

| Content-Type パターン | 表示コンポーネント | 切り替えオプション |
|----------------------|-------------------|--------------------|
| `application/json`, `text/json` | `JsonViewer`（既存） | Pretty / Raw |
| `text/html` | `HtmlViewer`（新規） | Preview / Source |
| `text/xml`, `application/xml`, `*+xml` | `XmlViewer`（新規） | Pretty / Raw |
| `image/*` | `ImageViewer`（新規） | なし |
| `text/plain`, その他テキスト系 | プレーンテキスト表示 | なし |
| `isBinary: true`（非画像） | 既存バイナリ警告 UI | なし |
| `contentType` 未定義 | JSON パース試行 → JsonViewer または プレーンテキスト | 成功時 Pretty / Raw |

### 4.2 画面レイアウト（Body タブ内）

```
┌──────────────────────────────────────────────────┐
│ [Pretty] [Raw]   ← JSON/XML の場合               │
│ [Preview] [Source]  ← HTML の場合                │
├──────────────────────────────────────────────────┤
│                                                  │
│  ビューアコンテンツ領域                           │
│  （スクロール可能）                               │
│                                                  │
└──────────────────────────────────────────────────┘
```

**HTML プレビューモード:**
```
┌──────────────────────────────────────────────────┐
│ [Preview ●] [Source]                             │
├──────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────┐   │
│ │  <iframe sandbox="allow-same-origin"       │   │
│ │   srcdoc または Blob URL でコンテンツ表示  │   │
│ │   高さ: 親コンテナに合わせてフレックス     │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**画像表示モード:**
```
┌──────────────────────────────────────────────────┐
│ （切り替えボタンなし）                            │
├──────────────────────────────────────────────────┤
│                                                  │
│   ┌─────────────────┐                           │
│   │  <img> 実際の   │                           │
│   │  画像が表示      │                           │
│   └─────────────────┘                           │
│   image/png • 42.3 KB                           │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 4.3 ユーザー操作フロー

1. ユーザーがリクエストを送信する
2. システムがレスポンスの `contentType` を参照し、適切なビューアを選択する
3. Body タブを開くと、選択されたビューアが自動的に表示される
4. HTML レスポンスの場合、デフォルトで **Preview** モードが表示される
5. ユーザーが **Source** ボタンをクリックすると、HTML ソースがハイライト付きで表示される
6. JSON / XML の場合、デフォルトで **Pretty** モードが表示される
7. ユーザーが **Raw** ボタンをクリックすると、整形なしのテキストが表示される

### 4.4 エラーハンドリング

| エラー条件 | 表示 | 対処方法 |
|-----------|------|---------|
| XML パースに失敗した場合 | Pretty ボタンをグレーアウト、Raw のみ表示 | Raw テキストをそのまま表示 |
| 画像 Blob URL 生成に失敗した場合 | 「画像の表示に失敗しました」メッセージ + Content-Type をモノスペースで表示 | — |
| iframe の Blob URL 生成に失敗した場合 | HTML ソース表示にフォールバック | ユーザーへの通知は不要 |
| ボディが空文字列の場合 | 「レスポンスボディは空です」メッセージ | — |

---

## 5. API 設計

### 5.1 使用する外部 API

N/A（ユーザーが任意の REST API を呼び出す機能のため）

### 5.2 内部 API ルート（Next.js API Routes）

変更なし。既存の `/api/proxy/route.ts` を使用する。

プロキシ側の変更点: レスポンスの `Content-Type` ヘッダーを `contentType` フィールドとして返すことはすでに実装済みのため、追加変更は不要。

---

## 6. データモデル変更

### 6.1 localStorage スキーマ変更

`ResponseState` は変更なし。`contentType` および `isBinary` フィールドはすでに定義済み。

```typescript
// 変更なし（参考）
interface ResponseState {
  // ... 既存フィールド ...
  contentType?: string;   // すでに存在
  isBinary?: boolean;     // すでに存在
}
```

### 6.2 マイグレーション方針

データモデル変更なし。既存の `HistoryItem` データは影響を受けない。

---

## 7. 実装スコープ（コンポーネント構成）

### 新規コンポーネント

| コンポーネント | ファイルパス | 役割 |
|--------------|-------------|------|
| `HtmlViewer` | `components/HtmlViewer.tsx` | HTML の iframe プレビュー + ソース表示切り替え |
| `XmlViewer` | `components/XmlViewer.tsx` | XML のシンタックスハイライト + Pretty/Raw 切り替え |
| `ImageViewer` | `components/ImageViewer.tsx` | 画像の `<img>` 表示 |

### 変更コンポーネント

| コンポーネント | ファイルパス | 変更内容 |
|--------------|-------------|---------|
| `ResponsePanel` | `components/ResponsePanel.tsx` | Body タブの表示ロジックに Content-Type 判定を追加し、各ビューアへ委譲する |

### 変更なしコンポーネント

| コンポーネント | 理由 |
|--------------|------|
| `JsonViewer` | 既存実装をそのまま使用 |
| `lib/types.ts` | `ResponseState` に変更不要 |
| `lib/storage.ts` | ストレージスキーマ変更なし |

### コンテンツタイプ判定ロジック（ResponsePanel 内）

```typescript
// 概念的な判定フロー（実装の詳細は実装者に委ねる）
function resolveViewer(response: ResponseState): ViewerType {
  const ct = response.contentType?.toLowerCase() ?? '';

  if (response.isBinary) {
    if (ct.startsWith('image/')) return 'image';
    return 'binary';
  }
  if (ct.includes('application/json') || ct.includes('text/json')) return 'json';
  if (ct.includes('text/html')) return 'html';
  if (ct.includes('xml')) return 'xml';  // text/xml, application/xml, *+xml
  if (ct.startsWith('text/') || ct === '') {
    // contentType が空の場合は JSON パースを試みる
    try { JSON.parse(response.body); return 'json'; } catch { /* */ }
    return 'plaintext';
  }
  return 'plaintext';
}
```

---

## 8. 受け入れ条件

- [ ] **AC1**: Content-Type が `text/html` のレスポンスを受信したとき、Body タブに iframe プレビューが表示されること
- [ ] **AC2**: HTML プレビュー表示中に **Source** ボタンをクリックすると、HTML ソースが表示されること。再度 **Preview** をクリックすると iframe プレビューに戻ること
- [ ] **AC3**: HTML iframe の `sandbox` 属性に `allow-scripts` が含まれないこと（DevTools で確認可能）
- [ ] **AC4**: Content-Type が `application/json` のレスポンスを受信したとき、Pretty 表示でシンタックスハイライトが適用されること
- [ ] **AC5**: JSON の Pretty / Raw 切り替えが従来通り動作すること（既存の `JsonViewer` 動作が変わらないこと）
- [ ] **AC6**: Content-Type が `text/xml` または `application/xml` のレスポンスを受信したとき、シンタックスハイライト付きで表示されること
- [ ] **AC7**: Content-Type が `image/png`, `image/jpeg`, `image/gif`, `image/svg+xml` のレスポンスを受信したとき、`<img>` タグで画像が表示されること
- [ ] **AC8**: `isBinary: true` かつ `contentType` が `image/` で始まらない場合、既存の「バイナリ / 画像レスポンス」UIが表示されること
- [ ] **AC9**: `contentType` が未定義でボディが有効な JSON の場合、`JsonViewer` で表示されること
- [ ] **AC10**: `contentType` が未定義でボディが JSON でない場合、プレーンテキストとして表示されること
- [ ] **AC11**: 既存の履歴データ（`HistoryItem`）を読み込んだとき、表示が壊れないこと（リグレッションなし）
- [ ] **AC12**: 各新規コンポーネントが `'use client'` ディレクティブで始まること

---

## 9. 備考・制約

- **依存する他機能**: なし（既存機能の拡張のみ）
- **既知の制約**:
  - `isBinary: true` の場合、`response.body` は空文字列またはプレースホルダーである可能性がある。画像表示には Blob データが必要だが、現行のプロキシ実装ではバイナリを base64 エンコードして返す方式への変更が必要になる可能性がある。画像表示 AC7 の実現可能性は `/api/proxy/route.ts` の実装を確認してから判断すること
  - 1 MB を超える大きなレスポンスの場合、XML の Pretty 整形処理がメインスレッドをブロックする可能性がある。必要に応じて Web Worker への移譲を検討する（初期実装スコープ外）
- **参考資料**:
  - [MDN: iframe sandbox](https://developer.mozilla.org/ja/docs/Web/HTML/Element/iframe#sandbox)
  - [MDN: URL.createObjectURL](https://developer.mozilla.org/ja/docs/Web/API/URL/createObjectURL)
  - 既存実装: `components/JsonViewer.tsx`（シンタックスハイライトの実装パターン参照）
  - 既存実装: `components/ResponsePanel.tsx`（現在の isBinary 分岐ロジック参照）
