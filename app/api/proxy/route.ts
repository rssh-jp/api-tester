import { NextRequest, NextResponse } from 'next/server';

/** Read the full response body by consuming the ReadableStream chunk by chunk.
 *  `response.text()` can silently return only the last chunk on some runtimes
 *  when the server uses chunked transfer-encoding, so we accumulate manually. */
async function readFullBody(response: Response): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate all chunks into a single buffer before decoding
  let totalLength = 0;
  for (const c of chunks) totalLength += c.length;
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  return new TextDecoder('utf-8').decode(merged);
}

export async function POST(req: NextRequest) {
  try {
    const { method, url, headers: reqHeaders, body } = await req.json();

    const startTime = Date.now();

    const fetchOptions: RequestInit = {
      method,
      headers: reqHeaders || {},
      // Disable Next.js fetch caching so we always get a fresh response
      cache: 'no-store',
      // Follow redirects so we get the final response, but track it
      redirect: 'follow',
    };

    if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);
    const responseTime = Date.now() - startTime;

    const contentType = response.headers.get('content-type') ?? '';
    // Binary types cannot be meaningfully shown as text
    const isBinary = /^(image|audio|video|font)\/|^application\/octet-stream|^application\/pdf/.test(contentType);

    // Read the full body — all chunks, not just the last one
    const responseBody = isBinary ? '' : await readFullBody(response);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      responseTime,
      size: isBinary
        ? parseInt(response.headers.get('content-length') ?? '0', 10) || 0
        : new TextEncoder().encode(responseBody).length,
      contentType,
      redirected: response.redirected,
      finalUrl: response.url,
      isBinary,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

