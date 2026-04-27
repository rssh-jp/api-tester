export interface SendRequestParams {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
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

export async function sendRequest(params: SendRequestParams): Promise<SendRequestResult> {
  if (!STATIC) {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  }

  const startTime = Date.now();
  const canHaveBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(params.method);
  const fetchRes = await fetch(params.url, {
    method: params.method,
    headers: params.headers,
    body: canHaveBody && params.body ? params.body : undefined,
    redirect: 'follow',
  });
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
