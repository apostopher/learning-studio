/** Bytes of HTML we will hold in memory for one page. */
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

const USER_AGENT =
  'RMTPStudioNewsBot/1.0 (+https://github.com/; course news aggregation)';

export type FetchPageResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: string };

/**
 * Fetch a page as HTML with three hard limits.
 *
 * The size cap is enforced **while reading the stream**, not by checking
 * `content-length` afterwards: a hostile or merely broken endpoint can omit
 * the header, or lie in it, and `res.text()` will then buffer until the
 * function dies. Reading chunk by chunk and aborting past the ceiling is the
 * only version that actually bounds memory.
 */
export async function fetchPage(
  url: string,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<FetchPageResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'fetch threw',
    };
  }

  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

  const contentType = res.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    // Cancel rather than leave the body dangling — an unread body keeps the
    // connection alive until GC.
    await res.body?.cancel().catch(() => {});
    return { ok: false, reason: `unexpected content-type: ${contentType}` };
  }

  if (!res.body) return { ok: false, reason: 'empty response body' };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PAGE_BYTES) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          reason: `page exceeded ${MAX_PAGE_BYTES} bytes`,
        };
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'stream read failed',
    };
  }

  return { ok: true, html: chunks.join(''), finalUrl: res.url || url };
}
