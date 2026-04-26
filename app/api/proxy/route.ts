import { NextRequest, NextResponse } from 'next/server';
import * as http from 'node:http';
import * as https from 'node:https';

function makeRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  redirectCount = 0
): Promise<{
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  buffer: Buffer;
  finalUrl: string;
}> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) {
      return reject(new Error('Too many redirects'));
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error(`Invalid URL: ${url}`));
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers,
    };

    const clientReq = lib.request(options, (res) => {
      // Handle redirects
      if (
        res.statusCode !== undefined &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        res.resume(); // drain the response
        const redirectUrl = new URL(res.headers.location, url).toString();
        // On redirect, strip body for GET-like redirects
        const redirectMethod =
          res.statusCode === 303 ? 'GET' : method;
        const redirectBody =
          redirectMethod === 'GET' ? undefined : body;
        resolve(
          makeRequest(redirectUrl, redirectMethod, headers, redirectBody, redirectCount + 1)
        );
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const responseHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined) continue;
          responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
        }
        resolve({
          statusCode: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          headers: responseHeaders,
          buffer,
          finalUrl: url,
        });
      });
      res.on('error', reject);
    });

    clientReq.on('error', reject);

    if (body) {
      clientReq.write(body);
    }
    clientReq.end();
  });
}

export async function POST(req: NextRequest) {
  try {
    const { method, url, headers: reqHeaders, body } = await req.json();

    const startTime = Date.now();

    const bodyToSend: string | undefined =
      body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? body : undefined;

    const { statusCode, statusText, headers, buffer, finalUrl } = await makeRequest(
      url,
      method,
      reqHeaders || {},
      bodyToSend
    );

    const responseTime = Date.now() - startTime;

    const contentType = headers['content-type'] ?? '';
    const isBinary =
      /^(image|audio|video|font)\/|^application\/octet-stream|^application\/pdf/.test(
        contentType
      );

    const responseBody = isBinary ? '' : buffer.toString('utf-8');
    const size = isBinary
      ? parseInt(headers['content-length'] ?? '0', 10) || 0
      : buffer.length;

    return NextResponse.json({
      status: statusCode,
      statusText,
      headers,
      body: responseBody,
      responseTime,
      size,
      contentType,
      redirected: false,
      finalUrl,
      isBinary,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

