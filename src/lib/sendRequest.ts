import { DEFAULT_REQUEST_TIMEOUT_MS } from './types';

export interface SendRequestParams {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface SendRequestResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  responseTime: number;
  size: number;
  error?: string;
  contentType?: string;
  redirected?: boolean;
  finalUrl?: string;
  isBinary?: boolean;
}

const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';

function normalizeRequestTimeoutMs(timeoutMs: number | undefined): number {
  return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs >= 1
    ? timeoutMs
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

export async function sendRequest(params: SendRequestParams): Promise<SendRequestResult> {
  const timeoutMs = normalizeRequestTimeoutMs(params.timeoutMs);

  if (!STATIC) {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, timeoutMs }),
      cache: 'no-store',
    });
    return res.json();
  }

  const startTime = Date.now();
  const canHaveBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(params.method);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let fetchRes: Response;
  try {
    fetchRes = await fetch(params.url, {
      method: params.method,
      headers: params.headers,
      body: canHaveBody && params.body ? params.body : undefined,
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (timedOut || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new Error(`Request timeout (${timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const responseTime = Date.now() - startTime;

  const contentType = fetchRes.headers.get('content-type') ?? '';
  const isBinary = /^(image|audio|video|font)\/|^application\/octet-stream|^application\/pdf/.test(contentType);

  const responseHeaders: Record<string, string> = {};
  fetchRes.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  let body = '';
  let size = 0;
  if (isBinary) {
    const blob = await fetchRes.blob();
    size = blob.size;
  } else {
    body = await fetchRes.text();
    size = new TextEncoder().encode(body).length;
  }

  return {
    status: fetchRes.status,
    statusText: fetchRes.statusText,
    headers: responseHeaders,
    body,
    responseTime,
    size,
    contentType,
    redirected: fetchRes.redirected,
    finalUrl: fetchRes.url,
    isBinary,
  };
}
