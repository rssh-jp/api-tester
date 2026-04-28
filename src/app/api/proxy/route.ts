import { NextRequest, NextResponse } from 'next/server';
import * as http from 'node:http';
import * as https from 'node:https';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';

const BROWSER_DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

async function decompress(buffer: Buffer, encoding: string): Promise<Buffer> {
  const enc = encoding.toLowerCase();
  if (enc.includes('br')) return promisify(zlib.brotliDecompress)(buffer);
  if (enc.includes('gzip')) return promisify(zlib.gunzip)(buffer);
  if (enc.includes('deflate')) return promisify(zlib.inflate)(buffer);
  return buffer;
}

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

    const mergedHeaders: Record<string, string> = {
      ...BROWSER_DEFAULT_HEADERS,
      ...(reqHeaders || {}),
    };

    const { statusCode, statusText, headers, buffer, finalUrl } = await makeRequest(
      url,
      method,
      mergedHeaders,
      bodyToSend
    );

    const responseTime = Date.now() - startTime;

    const contentType = headers['content-type'] ?? '';
    const isBinary =
      /^(image|audio|video|font)\/|^application\/octet-stream|^application\/pdf/.test(
        contentType
      );

    const contentEncoding = headers['content-encoding'] ?? '';
    const decodedBuffer = isBinary ? buffer : await decompress(buffer, contentEncoding);

    const responseBody = isBinary ? '' : decodedBuffer.toString('utf-8');
    const size = isBinary
      ? parseInt(headers['content-length'] ?? '0', 10) || 0
      : decodedBuffer.length;

    const responseHeaders = { ...headers };
    delete responseHeaders['content-encoding'];

    return NextResponse.json({
      status: statusCode,
      statusText,
      headers: responseHeaders,
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

