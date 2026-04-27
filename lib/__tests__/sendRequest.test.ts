import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('sendRequest (proxy mode - STATIC=false)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('POSTs to /api/proxy and returns parsed JSON', async () => {
    const mockResult = { status: 200, statusText: 'OK', headers: {}, body: 'hello', responseTime: 10, size: 5 };
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockResult),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { sendRequest } = await import('../sendRequest');
    const result = await sendRequest({ method: 'GET', url: 'http://example.com', headers: {} });

    expect(result).toEqual(mockResult);
    expect(mockFetch).toHaveBeenCalledWith('/api/proxy', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
  });
});

describe('sendRequest (static mode - STATIC=true)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_STATIC_EXPORT = 'true';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_STATIC_EXPORT;
    vi.unstubAllGlobals();
  });

  function makeMockResponse(overrides: {
    contentType?: string | null;
    body?: string;
    blobContent?: string;
    redirected?: boolean;
    finalUrl?: string;
  } = {}) {
    const contentType = overrides.contentType !== undefined ? overrides.contentType : 'application/json';
    const body = overrides.body ?? '{"ok":true}';
    const headers = contentType !== null
      ? new Headers({ 'content-type': contentType })
      : new Headers();
    return {
      status: 200,
      statusText: 'OK',
      headers,
      text: vi.fn().mockResolvedValue(body),
      blob: vi.fn().mockResolvedValue(new Blob([overrides.blobContent ?? 'x'.repeat(100)])),
      redirected: overrides.redirected ?? false,
      url: overrides.finalUrl ?? 'http://example.com',
    };
  }

  it('returns parsed body for text/json response', async () => {
    const mock = makeMockResponse({ contentType: 'application/json', body: '{"ok":true}' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mock));

    const { sendRequest } = await import('../sendRequest');
    const result = await sendRequest({ method: 'GET', url: 'http://example.com', headers: {} });

    expect(result.status).toBe(200);
    expect(result.body).toBe('{"ok":true}');
    expect(result.isBinary).toBe(false);
    expect(result.contentType).toBe('application/json');
    expect(result.headers['content-type']).toBe('application/json');
  });

  it('handles binary (image/*) response', async () => {
    const mock = makeMockResponse({ contentType: 'image/png', blobContent: 'x'.repeat(100) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mock));

    const { sendRequest } = await import('../sendRequest');
    const result = await sendRequest({ method: 'GET', url: 'http://example.com', headers: {} });

    expect(result.isBinary).toBe(true);
    expect(result.body).toBe('');
    expect(result.size).toBe(100);
    expect(mock.blob).toHaveBeenCalled();
    expect(mock.text).not.toHaveBeenCalled();
  });

  it('handles redirect response', async () => {
    const mock = makeMockResponse({ redirected: true, finalUrl: 'http://final.example.com' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mock));

    const { sendRequest } = await import('../sendRequest');
    const result = await sendRequest({ method: 'GET', url: 'http://example.com', headers: {} });

    expect(result.redirected).toBe(true);
    expect(result.finalUrl).toBe('http://final.example.com');
  });

  it('sends body for POST method', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeMockResponse());
    vi.stubGlobal('fetch', mockFetch);

    const { sendRequest } = await import('../sendRequest');
    await sendRequest({ method: 'POST', url: 'http://example.com', headers: {}, body: '{"data":"test"}' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://example.com',
      expect.objectContaining({ body: '{"data":"test"}' })
    );
  });

  it('does not send body for GET method', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeMockResponse());
    vi.stubGlobal('fetch', mockFetch);

    const { sendRequest } = await import('../sendRequest');
    await sendRequest({ method: 'GET', url: 'http://example.com', headers: {}, body: 'should-be-ignored' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://example.com',
      expect.objectContaining({ body: undefined })
    );
  });
});
