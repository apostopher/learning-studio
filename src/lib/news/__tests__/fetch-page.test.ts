// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPage, MAX_PAGE_BYTES } from '#/lib/news/fetch-page';

const htmlResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPage', () => {
  it('returns the body for an HTML response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(htmlResponse('<html>hi</html>')),
    );
    const result = await fetchPage('https://x.com/a');
    expect(result).toMatchObject({ ok: true, html: '<html>hi</html>' });
  });

  it('sends a descriptive user-agent', async () => {
    const spy = vi.fn().mockResolvedValue(htmlResponse('<html></html>'));
    vi.stubGlobal('fetch', spy);
    await fetchPage('https://x.com/a');
    // Assert on what the server RECEIVED — robots.txt matching is keyed on it.
    expect(spy.mock.calls[0][1].headers['user-agent']).toContain(
      'RMTPStudioNewsBot',
    );
  });

  it('rejects a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 403 })),
    );
    expect(await fetchPage('https://x.com/a')).toEqual({
      ok: false,
      reason: 'HTTP 403',
    });
  });

  it('rejects a non-HTML content-type before parsing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const result = await fetchPage('https://x.com/a.json');
    expect(result.ok).toBe(false);
  });

  it('surfaces a thrown fetch (timeout, DNS) as a reason, not an exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('The operation was aborted')),
    );
    const result = await fetchPage('https://x.com/a');
    expect(result).toEqual({
      ok: false,
      reason: 'The operation was aborted',
    });
  });

  /**
   * The cap must hold when the server lies about (or omits) content-length —
   * which is exactly the case `res.text()` cannot survive. The stream below
   * would never end on its own.
   */
  it('aborts an oversized body while streaming, without a content-length', async () => {
    const chunk = new Uint8Array(256 * 1024);
    let emitted = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitted += chunk.byteLength;
        // Far past the ceiling; if the cap did not fire this never terminates.
        if (emitted > MAX_PAGE_BYTES * 20) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );

    const result = await fetchPage('https://x.com/huge');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/exceeded/);
    // Stopped near the ceiling rather than draining the whole stream.
    expect(emitted).toBeLessThan(MAX_PAGE_BYTES * 2);
  });

  it('accepts a body just under the ceiling', async () => {
    const body = 'a'.repeat(1024);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(body)));
    const result = await fetchPage('https://x.com/a');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.html).toHaveLength(1024);
  });
});
