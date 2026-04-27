import { describe, it, expect } from 'vitest';
import {
  buildCategoryChain,
  mergeKeyValues,
  computeEffectiveValues,
  computeEffectiveVariables,
  applyVariables,
} from '../inheritance';
import { Category, KeyValuePair } from '../types';

function makeCategory(id: string, parentId: string | null, overrides: Partial<Category> = {}): Category {
  return {
    id,
    name: `Cat-${id}`,
    parentId,
    defaultHeaders: [],
    defaultParams: [],
    variables: [],
    createdAt: 0,
    ...overrides,
  };
}

function kv(key: string, value: string, enabled = true): KeyValuePair {
  return { id: key, key, value, enabled };
}

describe('buildCategoryChain', () => {
  it('returns [] for null categoryId', () => {
    expect(buildCategoryChain(null, [])).toEqual([]);
  });

  it('returns [cat] for single category with no parent', () => {
    const cat = makeCategory('a', null);
    expect(buildCategoryChain('a', [cat])).toEqual([cat]);
  });

  it('returns [immediate, mid, root] for chain of 3', () => {
    const root = makeCategory('root', null);
    const mid = makeCategory('mid', 'root');
    const immediate = makeCategory('imm', 'mid');
    const result = buildCategoryChain('imm', [root, mid, immediate]);
    expect(result).toEqual([immediate, mid, root]);
  });

  it('returns [] for unknown categoryId', () => {
    expect(buildCategoryChain('nonexistent', [])).toEqual([]);
  });

  it('returns partial chain when parent is not found', () => {
    const cat = makeCategory('child', 'missing-parent');
    const result = buildCategoryChain('child', [cat]);
    expect(result).toEqual([cat]);
  });
});

describe('mergeKeyValues', () => {
  it('returns [] for empty request and empty chain', () => {
    expect(mergeKeyValues([], [], 'defaultHeaders')).toEqual([]);
  });

  it('includes root category defaults', () => {
    const root = makeCategory('root', null, {
      defaultHeaders: [kv('X-Root', 'root-value')],
    });
    const result = mergeKeyValues([], [root], 'defaultHeaders');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('root-value');
  });

  it('request values override category defaults', () => {
    const root = makeCategory('root', null, {
      defaultHeaders: [kv('Authorization', 'cat-token')],
    });
    const result = mergeKeyValues([kv('Authorization', 'req-token')], [root], 'defaultHeaders');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('req-token');
  });

  it('immediate category overrides root category for same key', () => {
    const root = makeCategory('root', null, {
      defaultHeaders: [kv('Authorization', 'root-token')],
    });
    const immediate = makeCategory('imm', 'root', {
      defaultHeaders: [kv('Authorization', 'imm-token')],
    });
    // chain is [immediate, root]; immediate overwrites root
    const result = mergeKeyValues([], [immediate, root], 'defaultHeaders');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('imm-token');
  });

  it('excludes disabled request entries', () => {
    const result = mergeKeyValues([kv('X-Disabled', 'val', false)], [], 'defaultHeaders');
    expect(result).toHaveLength(0);
  });

  it('excludes disabled category entries', () => {
    const root = makeCategory('root', null, {
      defaultHeaders: [kv('X-Disabled', 'val', false)],
    });
    const result = mergeKeyValues([], [root], 'defaultHeaders');
    expect(result).toHaveLength(0);
  });

  it('uses case-insensitive key comparison', () => {
    const root = makeCategory('root', null, {
      defaultHeaders: [kv('Authorization', 'cat-token')],
    });
    const result = mergeKeyValues([kv('AUTHORIZATION', 'req-token')], [root], 'defaultHeaders');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('req-token');
  });
});

describe('computeEffectiveValues', () => {
  it('merges both headers and params', () => {
    const cat = makeCategory('cat', null, {
      defaultHeaders: [kv('X-Header', 'hval')],
      defaultParams: [kv('page', '1')],
    });
    const result = computeEffectiveValues([], [], 'cat', [cat]);
    expect(result.headers).toHaveLength(1);
    expect(result.params).toHaveLength(1);
  });

  it('returns request values when categoryId is null', () => {
    const result = computeEffectiveValues(
      [kv('Authorization', 'req-token')],
      [kv('q', 'search')],
      null,
      []
    );
    expect(result.headers).toHaveLength(1);
    expect(result.headers[0].value).toBe('req-token');
    expect(result.params).toHaveLength(1);
    expect(result.params[0].value).toBe('search');
  });
});

describe('computeEffectiveVariables', () => {
  it('returns [] for null categoryId', () => {
    expect(computeEffectiveVariables(null, [])).toEqual([]);
  });

  it('returns variables for single category', () => {
    const cat = makeCategory('cat', null, {
      variables: [kv('BASE_URL', 'http://example.com')],
    });
    const result = computeEffectiveVariables('cat', [cat]);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('http://example.com');
  });

  it('immediate child variable overrides parent variable', () => {
    const parent = makeCategory('parent', null, {
      variables: [kv('HOST', 'http://parent.example.com')],
    });
    const child = makeCategory('child', 'parent', {
      variables: [kv('HOST', 'http://child.example.com')],
    });
    const result = computeEffectiveVariables('child', [parent, child]);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('http://child.example.com');
  });

  it('excludes disabled variables', () => {
    const cat = makeCategory('cat', null, {
      variables: [kv('VAR', 'value', false)],
    });
    expect(computeEffectiveVariables('cat', [cat])).toHaveLength(0);
  });

  it('handles cat.variables being undefined gracefully', () => {
    const cat = makeCategory('cat', null);
    (cat as unknown as Record<string, unknown>).variables = undefined;
    expect(() => computeEffectiveVariables('cat', [cat])).not.toThrow();
    expect(computeEffectiveVariables('cat', [cat])).toEqual([]);
  });
});

describe('applyVariables', () => {
  it('returns text unchanged when variables is empty', () => {
    expect(applyVariables('hello ${WORLD}', [])).toBe('hello ${WORLD}');
  });

  it('replaces defined variable', () => {
    expect(applyVariables('http://${HOST}/path', [kv('HOST', 'example.com')])).toBe('http://example.com/path');
  });

  it('leaves undefined variable as-is', () => {
    expect(applyVariables('${UNKNOWN}', [kv('FOO', 'bar')])).toBe('${UNKNOWN}');
  });

  it('replaces multiple variables in one string', () => {
    const result = applyVariables('${A} + ${B}', [kv('A', 'x'), kv('B', 'y')]);
    expect(result).toBe('x + y');
  });
});
