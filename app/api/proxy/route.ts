import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { method, url, headers: reqHeaders, body } = await req.json();

    const startTime = Date.now();

    const fetchOptions: RequestInit = {
      method,
      headers: reqHeaders || {},
    };

    if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);
    const responseTime = Date.now() - startTime;
    const responseBody = await response.text();

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
      size: new TextEncoder().encode(responseBody).length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
