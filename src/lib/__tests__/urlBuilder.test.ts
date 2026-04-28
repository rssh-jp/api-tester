import { describe, it, expect } from 'vitest';
import { buildUrlWithParams, extractBaseUrl } from '../urlBuilder';
import { KeyValuePair } from '../types';

function kv(key: string, value: string, enabled = true): KeyValuePair {
  return { id: key, key, value, enabled };
}

describe('buildUrlWithParams', () => {
  // ── 基本動作 ────────────────────────────────────────────────────────────

  it('returns baseUrl unchanged when params is empty', () => {
    expect(buildUrlWithParams('https://example.com', [])).toBe('https://example.com');
  });

  it('returns baseUrl unchanged when all params are disabled', () => {
    expect(buildUrlWithParams('https://example.com', [kv('q', 'search', false)])).toBe('https://example.com');
  });

  it('appends a single param', () => {
    const result = buildUrlWithParams('https://example.com/api', [kv('q', 'hello')]);
    expect(result).toBe('https://example.com/api?q=hello');
  });

  it('appends multiple params', () => {
    const result = buildUrlWithParams('https://example.com', [kv('a', '1'), kv('b', '2')]);
    expect(result).toContain('a=1');
    expect(result).toContain('b=2');
  });

  it('appends to existing query string', () => {
    const result = buildUrlWithParams('https://example.com?existing=yes', [kv('q', 'test')]);
    expect(result).toContain('existing=yes');
    expect(result).toContain('q=test');
  });

  it('handles URL without scheme', () => {
    const result = buildUrlWithParams('example.com/api', [kv('q', 'test')]);
    expect(result).toContain('q=test');
    expect(result).not.toContain('https://');
  });

  it('URL encodes special characters in param values (no placeholder)', () => {
    const result = buildUrlWithParams('https://example.com', [kv('q', 'hello world')]);
    // new URL() may add a trailing slash; accept both forms
    expect(result).toMatch(/^https:\/\/example\.com\/?\?q=hello\+world$/);
  });

  // ── 変数プレースホルダーを含む場合 ────────────────────────────────────

  it('does NOT encode ${...} in baseUrl — uses string concatenation', () => {
    const result = buildUrlWithParams('https://${HOST}/api', [kv('q', 'test')]);
    // ${HOST} must remain intact (not be encoded to $%7BHOST%7D)
    expect(result).toContain('${HOST}');
    expect(result).toContain('q=test');
  });

  it('does NOT encode ${...} in param values', () => {
    const result = buildUrlWithParams('https://example.com', [kv('token', '${API_TOKEN}')]);
    expect(result).toContain('token=${API_TOKEN}');
  });

  it('does NOT encode ${...} in param keys', () => {
    const result = buildUrlWithParams('https://example.com', [kv('${PARAM_NAME}', 'value')]);
    expect(result).toContain('${PARAM_NAME}=value');
  });

  it('uses string concatenation when URL has placeholder, appends correctly', () => {
    const result = buildUrlWithParams('https://${HOST}/path', [kv('a', '1'), kv('b', '2')]);
    expect(result).toBe('https://${HOST}/path?a=1&b=2');
  });

  it('applyVariables can expand placeholders in result URL', async () => {
    // This test validates the full scenario: buildUrlWithParams + applyVariables
    // Without the fix, new URL() would encode ${HOST} → $%7BHOST%7D and expansion would fail
    const { applyVariables } = await import('../inheritance');
    const built = buildUrlWithParams('https://${HOST}/api', [kv('version', '${API_VERSION}')]);
    const resolved = applyVariables(built, [
      { id: '1', key: 'HOST', value: 'example.com', enabled: true },
      { id: '2', key: 'API_VERSION', value: 'v2', enabled: true },
    ]);
    expect(resolved).toBe('https://example.com/api?version=v2');
  });

  // ── カテゴリーパラメータと変数の組み合わせ ─────────────────────────

  it('category param with variable value is preserved for later expansion', () => {
    // Simulates: category has defaultParam {key: "env", value: "${ENV}"},
    // request uses URL "https://${HOST}/data"
    const result = buildUrlWithParams('https://${HOST}/data', [kv('env', '${ENV}')]);
    expect(result).toBe('https://${HOST}/data?env=${ENV}');
  });

  it('falls back to string concat when URL fails to parse (no placeholder)', () => {
    // new URL('https://[::invalid') throws, so falls back to string concatenation
    // In that case, key/value without placeholders should be encodeURIComponent'd
    const result = buildUrlWithParams('[::invalid', [kv('q', 'hello world')]);
    expect(result).toContain('q=');
    expect(result).toContain('[::invalid');
  });

  it('falls back: key with special chars is encoded, value with placeholder is not', () => {
    const result = buildUrlWithParams('[::invalid', [kv('a b', '${TOKEN}')]);
    expect(result).toContain('a%20b=${TOKEN}');
  });

  it('skips param with empty key (falsy key short-circuits && in filter)', () => {
    const result = buildUrlWithParams('https://example.com', [
      { id: 'x', key: '', value: 'val', enabled: true },
    ]);
    expect(result).toBe('https://example.com');
  });
});

describe('extractBaseUrl', () => {
  it('removes query string from plain URL', () => {
    expect(extractBaseUrl('https://example.com/api?q=test')).toBe('https://example.com/api');
  });

  it('returns URL unchanged when no query string', () => {
    expect(extractBaseUrl('https://example.com/api')).toBe('https://example.com/api');
  });

  it('uses split when URL contains placeholder', () => {
    expect(extractBaseUrl('https://${HOST}/api?q=test')).toBe('https://${HOST}/api');
  });

  it('removes trailing slash added by new URL()', () => {
    const result = extractBaseUrl('https://example.com');
    // new URL('https://example.com').toString() = 'https://example.com/'
    // extractBaseUrl should strip the trailing slash
    expect(result).toBe('https://example.com');
  });

  it('handles URL without scheme', () => {
    const result = extractBaseUrl('example.com/api?q=test');
    expect(result).toBe('example.com/api');
  });

  it('falls back to split when URL fails to parse', () => {
    // '[::invalid' causes new URL() to throw → catch returns split result
    expect(extractBaseUrl('[::invalid/api?q=test')).toBe('[::invalid/api');
  });

  it('preserves trailing slash when original url ends with slash', () => {
    // url.endsWith('/') = true → !url.endsWith('/') = false → short-circuit → base returned as-is
    const result = extractBaseUrl('https://example.com/');
    expect(result).toBe('https://example.com/');
  });
});
