import { describe, it, expect } from 'vitest';
import { isDescendant } from '../../hooks/useDragAndDrop';
import { Category } from '../types';

function makeCategory(id: string, parentId: string | null): Category {
  return {
    id,
    name: id,
    parentId,
    defaultHeaders: [],
    defaultParams: [],
    variables: [],
    createdAt: 0,
  };
}

describe('isDescendant', () => {
  const categories: Category[] = [
    makeCategory('root', null),
    makeCategory('child1', 'root'),
    makeCategory('child2', 'root'),
    makeCategory('grandchild1', 'child1'),
    makeCategory('grandchild2', 'child1'),
    makeCategory('great', 'grandchild1'),
  ];

  it('直接の子は祖先の子孫と判定される', () => {
    expect(isDescendant('root', 'child1', categories)).toBe(true);
  });

  it('孫は祖先の子孫と判定される', () => {
    expect(isDescendant('root', 'grandchild1', categories)).toBe(true);
  });

  it('曾孫は祖先の子孫と判定される', () => {
    expect(isDescendant('root', 'great', categories)).toBe(true);
  });

  it('child1の子孫であるgrandchild1を正しく判定する', () => {
    expect(isDescendant('child1', 'grandchild1', categories)).toBe(true);
  });

  it('child1の子孫であるgreatを正しく判定する', () => {
    expect(isDescendant('child1', 'great', categories)).toBe(true);
  });

  it('兄弟カテゴリーは子孫ではない', () => {
    expect(isDescendant('child1', 'child2', categories)).toBe(false);
  });

  it('親は子の子孫ではない', () => {
    expect(isDescendant('child1', 'root', categories)).toBe(false);
  });

  it('自分自身は子孫ではない（直接チェック: parentIdが自分ではない）', () => {
    // isDescendantは nodeId === ancestorId のケースをループで辿らないため false になる
    expect(isDescendant('child1', 'child1', categories)).toBe(false);
  });

  it('全く別ブランチのカテゴリーは子孫ではない', () => {
    expect(isDescendant('child2', 'grandchild1', categories)).toBe(false);
  });

  it('存在しないノードはfalseを返す', () => {
    expect(isDescendant('root', 'nonexistent', categories)).toBe(false);
  });

  it('存在しない祖先IDはfalseを返す', () => {
    expect(isDescendant('nonexistent', 'child1', categories)).toBe(false);
  });

  it('空のカテゴリー配列はfalseを返す', () => {
    expect(isDescendant('root', 'child1', [])).toBe(false);
  });

  it('ルートレベルカテゴリー（parentId: null）は誰の子孫でもない', () => {
    expect(isDescendant('other-root', 'root', categories)).toBe(false);
  });

  describe('循環参照ガード（カテゴリー移動の安全性検証）', () => {
    it('カテゴリーをその子孫へ移動しようとした場合は拒否される', () => {
      // root -> child1 -> grandchild1 の構造で
      // child1 を grandchild1 の子にしようとするのは循環参照 → 拒否
      expect(isDescendant('child1', 'grandchild1', categories)).toBe(true);
    });

    it('カテゴリーを兄弟カテゴリーへ移動するのは許可される', () => {
      // child1 を child2 の子にする → 許可
      expect(isDescendant('child1', 'child2', categories)).toBe(false);
    });

    it('カテゴリーをルートレベルへ移動するのは常に許可される', () => {
      // null へのドロップはisDescendantを呼ばないが、念のためroot系を確認
      expect(isDescendant('child1', 'root', categories)).toBe(false);
    });
  });
});
