import { KeyValuePair } from './types';

/**
 * Build a URL by appending query parameters.
 *
 * When the URL or any param value contains ${...} variable placeholders,
 * `new URL()` is avoided because it would percent-encode the braces and break
 * subsequent `applyVariables()` expansion. In that case a simple string
 * concatenation is used instead.
 */
export function buildUrlWithParams(baseUrl: string, params: KeyValuePair[]): string {
  const enabledParams = params.filter(p => p.key && p.enabled);
  if (enabledParams.length === 0) return baseUrl;

  const hasPlaceholder = (s: string) => /\$\{[^}]+\}/.test(s);
  if (
    !hasPlaceholder(baseUrl) &&
    !enabledParams.some(p => hasPlaceholder(p.key) || hasPlaceholder(p.value))
  ) {
    try {
      const urlStr = baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`;
      const url = new URL(urlStr);
      enabledParams.forEach(p => url.searchParams.set(p.key, p.value));
      return baseUrl.includes('://') ? url.toString() : url.toString().replace('https://', '');
    } catch {
      // fall through to string concatenation
    }
  }

  const qs = enabledParams
    .map(p => {
      const k = hasPlaceholder(p.key) ? p.key : encodeURIComponent(p.key);
      const v = hasPlaceholder(p.value) ? p.value : encodeURIComponent(p.value);
      return `${k}=${v}`;
    })
    .join('&');
  return baseUrl.includes('?') ? `${baseUrl}&${qs}` : `${baseUrl}?${qs}`;
}

/**
 * Strip the query string from a URL, preserving ${...} variable placeholders.
 * Falls back to simple split('?') to avoid new URL() encoding the placeholders.
 */
export function extractBaseUrl(url: string): string {
  if (/\$\{[^}]+\}/.test(url)) {
    return url.split('?')[0];
  }
  try {
    const urlStr = url.includes('://') ? url : `https://${url}`;
    const parsed = new URL(urlStr);
    parsed.search = '';
    const base = url.includes('://') ? parsed.toString() : parsed.toString().replace('https://', '');
    if (!url.endsWith('/') && base.endsWith('/')) {
      return base.slice(0, -1);
    }
    return base;
  } catch {
    return url.split('?')[0];
  }
}
