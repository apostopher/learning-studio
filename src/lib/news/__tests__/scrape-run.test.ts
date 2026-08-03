// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  embed: vi.fn(),
  extractNewsLinks: vi.fn(),
  isCrawlAllowed: vi.fn(),
  fetchPage: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  listScrapeTargets: vi.fn(),
  findSimilarArticles: vi.fn(),
  upsertArticle: vi.fn(),
  recordScrapeOutcome: vi.fn(),
  deleteExpiredArticles: vi.fn(),
}));

vi.mock('ai', () => ({ embed: m.embed }));
vi.mock('#/ai/gemini', () => ({ embeddingModel: 'stub-embedding-model' }));
vi.mock('#/ai/news-links', () => ({ extractNewsLinks: m.extractNewsLinks }));
vi.mock('#/lib/news/robots', () => ({ isCrawlAllowed: m.isCrawlAllowed }));
vi.mock('#/lib/news/fetch-page', () => ({
  fetchPage: m.fetchPage,
  MAX_PAGE_BYTES: 2 * 1024 * 1024,
}));
vi.mock('#/integrations/upstash/redis', () => ({
  redis: { get: m.redisGet, set: m.redisSet },
}));
vi.mock('#/db/news-articles', () => ({
  RETENTION_DAYS: 7,
  listScrapeTargets: m.listScrapeTargets,
  findSimilarArticles: m.findSimilarArticles,
  upsertArticle: m.upsertArticle,
  recordScrapeOutcome: m.recordScrapeOutcome,
  deleteExpiredArticles: m.deleteExpiredArticles,
}));

import { runNewsScrape } from '#/lib/news/scrape-run';

const NOW = new Date('2026-08-03T04:00:00.000Z');

const source = (over: Partial<{ id: number; url: string; rank: number }>) => ({
  id: over.id ?? 1,
  courseId: 10,
  url: over.url ?? 'https://www.avweb.com/',
  selectors: null,
  rank: over.rank ?? 1,
  lastScrapedAt: null,
});

const indexPage = (links: string[]) => ({
  ok: true as const,
  finalUrl: 'https://www.avweb.com/',
  html: `<html><body>${links.map((l) => `<a href="${l}">x</a>`).join('')}</body></html>`,
});

const articlePage = (opts: {
  url: string;
  title: string;
  published?: string;
  description?: string;
}) => ({
  ok: true as const,
  finalUrl: opts.url,
  html: `<html><head>
    <meta property="og:title" content="${opts.title}">
    ${opts.description ? `<meta property="og:description" content="${opts.description}">` : ''}
    ${opts.published ? `<meta property="article:published_time" content="${opts.published}">` : ''}
  </head><body></body></html>`,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  m.redisGet.mockResolvedValue(null);
  m.redisSet.mockResolvedValue('OK');
  m.isCrawlAllowed.mockResolvedValue(true);
  m.embed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
  m.findSimilarArticles.mockResolvedValue([]);
  m.upsertArticle.mockImplementation(async () => ({ id: 1 }));
  m.recordScrapeOutcome.mockResolvedValue(undefined);
  m.deleteExpiredArticles.mockResolvedValue({ deleted: 0 });
  m.extractNewsLinks.mockResolvedValue({ ok: true, links: [] });
});

describe('runNewsScrape — robots', () => {
  it('skips a disallowed source without fetching it, and records why', async () => {
    m.listScrapeTargets.mockResolvedValue([source({})]);
    m.isCrawlAllowed.mockResolvedValue(false);

    await runNewsScrape({ budgetMs: 60_000, now: NOW });

    expect(m.fetchPage).not.toHaveBeenCalled();
    // Assert the CONSUMER received the reason — an empty feed with no stored
    // status is indistinguishable from every other failure.
    expect(m.recordScrapeOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 1, status: 'blocked_by_robots' }),
    );
  });
});

describe('runNewsScrape — link guards', () => {
  it('discards off-domain links before fetching them', async () => {
    m.listScrapeTargets.mockResolvedValue([source({})]);
    m.fetchPage.mockResolvedValue(indexPage([]));
    m.extractNewsLinks.mockResolvedValue({
      ok: true,
      links: [
        'http://169.254.169.254/latest/meta-data/',
        'http://127.0.0.1:8080/admin',
        'https://www.flyingmag.com/other',
      ],
    });

    await runNewsScrape({ budgetMs: 60_000, now: NOW });

    // Only the index page itself was fetched — no candidate survived.
    expect(m.fetchPage).toHaveBeenCalledTimes(1);
    expect(m.recordScrapeOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'no_links_found' }),
    );
    expect(m.upsertArticle).not.toHaveBeenCalled();
  });

  it('records no_links_found when the page yields nothing', async () => {
    m.listScrapeTargets.mockResolvedValue([source({})]);
    m.fetchPage.mockResolvedValue(indexPage([]));
    m.extractNewsLinks.mockResolvedValue({ ok: true, links: [] });

    await runNewsScrape({ budgetMs: 60_000, now: NOW });
    expect(m.recordScrapeOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'no_links_found' }),
    );
  });
});

describe('runNewsScrape — selection', () => {
  const withThreeArticles = () => {
    m.listScrapeTargets.mockResolvedValue([source({})]);
    m.extractNewsLinks.mockResolvedValue({
      ok: true,
      links: [
        'https://www.avweb.com/a',
        'https://www.avweb.com/b',
        'https://www.avweb.com/c',
        'https://www.avweb.com/d',
      ],
    });
    m.fetchPage.mockImplementation(async (url: string) => {
      if (url === 'https://www.avweb.com/') return indexPage([]);
      const dates: Record<string, string> = {
        'https://www.avweb.com/a': '2026-08-02T00:00:00Z',
        'https://www.avweb.com/b': '2026-08-01T00:00:00Z',
        'https://www.avweb.com/c': '2026-07-30T00:00:00Z',
        'https://www.avweb.com/d': '2026-07-20T00:00:00Z',
      };
      return articlePage({ url, title: `Title ${url}`, published: dates[url] });
    });
  };

  it('keeps only the 3 most recent of four candidates', async () => {
    withThreeArticles();
    const result = await runNewsScrape({ budgetMs: 60_000, now: NOW });

    expect(result.articlesWritten).toBe(3);
    const written = m.upsertArticle.mock.calls.map((c) => c[0].canonicalUrl);
    expect(written).toEqual([
      'https://www.avweb.com/a',
      'https://www.avweb.com/b',
      'https://www.avweb.com/c',
    ]);
    expect(written).not.toContain('https://www.avweb.com/d');
  });

  it('flags an undated article as estimated rather than dropping it', async () => {
    m.listScrapeTargets.mockResolvedValue([source({})]);
    m.extractNewsLinks.mockResolvedValue({
      ok: true,
      links: ['https://www.avweb.com/undated'],
    });
    m.fetchPage.mockImplementation(async (url: string) =>
      url === 'https://www.avweb.com/'
        ? indexPage([])
        : articlePage({ url, title: 'No date here' }),
    );

    await runNewsScrape({ budgetMs: 60_000, now: NOW });

    expect(m.upsertArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedAtEstimated: true,
        publishedAt: NOW,
      }),
    );
    expect(m.recordScrapeOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'no_dated_articles' }),
    );
  });
});

describe('runNewsScrape — dedup', () => {
  it('marks the later source as a duplicate of the earlier match', async () => {
    m.listScrapeTargets.mockResolvedValue([
      source({ id: 1, url: 'https://www.avweb.com/', rank: 1 }),
      source({ id: 2, url: 'https://www.flyingmag.com/', rank: 2 }),
    ]);
    m.extractNewsLinks.mockImplementation(async (html: string) =>
      html.includes('avweb')
        ? { ok: true, links: ['https://www.avweb.com/faa-rule'] }
        : { ok: true, links: ['https://www.flyingmag.com/faa-rule'] },
    );
    m.fetchPage.mockImplementation(async (url: string) => {
      if (url.endsWith('.com/')) return indexPage([`${url}faa-rule`]);
      return articlePage({
        url,
        title: 'FAA finalizes BasicMed expansion',
        published: '2026-08-02T00:00:00Z',
      });
    });
    m.upsertArticle.mockImplementation(async (input) => ({
      id: input.newsSourceId === 1 ? 100 : 200,
    }));
    // First article finds nothing; the second matches the row the first wrote.
    m.findSimilarArticles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 100, similarity: 0.93 }]);

    const result = await runNewsScrape({ budgetMs: 60_000, now: NOW });

    expect(result.duplicatesFound).toBe(1);
    const [first, second] = m.upsertArticle.mock.calls.map((c) => c[0]);
    // Rank 1 processed first, so it is the original...
    expect(first.newsSourceId).toBe(1);
    expect(first.dedupeOfId).toBeNull();
    // ...and the rank-2 source's copy points at it, rather than the reverse.
    expect(second.newsSourceId).toBe(2);
    expect(second.dedupeOfId).toBe(100);
  });

  it('stores the article without a vector when embedding fails', async () => {
    m.listScrapeTargets.mockResolvedValue([source({})]);
    m.extractNewsLinks.mockResolvedValue({
      ok: true,
      links: ['https://www.avweb.com/a'],
    });
    m.fetchPage.mockImplementation(async (url: string) =>
      url === 'https://www.avweb.com/'
        ? indexPage([])
        : articlePage({
            url,
            title: 'A story',
            published: '2026-08-02T00:00:00Z',
          }),
    );
    m.embed.mockRejectedValue(new Error('quota exceeded'));

    await runNewsScrape({ budgetMs: 60_000, now: NOW });

    // A missing story is a worse outcome than a possible duplicate.
    expect(m.upsertArticle).toHaveBeenCalledWith(
      expect.objectContaining({ embedding: null, dedupeOfId: null }),
    );
  });
});

describe('runNewsScrape — budget and isolation', () => {
  it('defers every source when the budget is already spent, and says which', async () => {
    m.listScrapeTargets.mockResolvedValue([
      source({ id: 1, url: 'https://www.avweb.com/' }),
      source({ id: 2, url: 'https://www.flyingmag.com/' }),
    ]);

    const result = await runNewsScrape({ budgetMs: 0, now: NOW });

    expect(result.sourcesSkipped).toBe(2);
    expect(result.budgetExhausted).toBe(true);
    expect(m.fetchPage).not.toHaveBeenCalled();
    // Silent truncation would read as "we covered everything".
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('www.avweb.com'),
    );
  });

  it('lets one failing source not stop the others', async () => {
    m.listScrapeTargets.mockResolvedValue([
      source({ id: 1, url: 'https://www.avweb.com/', rank: 1 }),
      source({ id: 2, url: 'https://www.flyingmag.com/', rank: 2 }),
    ]);
    m.fetchPage.mockImplementation(async (url: string) => {
      if (url === 'https://www.avweb.com/') {
        return { ok: false as const, reason: 'HTTP 500' };
      }
      if (url === 'https://www.flyingmag.com/') return indexPage([]);
      return articlePage({
        url,
        title: 'Still works',
        published: '2026-08-02T00:00:00Z',
      });
    });
    m.extractNewsLinks.mockResolvedValue({
      ok: true,
      links: ['https://www.flyingmag.com/a'],
    });

    const result = await runNewsScrape({ budgetMs: 60_000, now: NOW });

    expect(result.sourcesProcessed).toBe(2);
    expect(result.articlesWritten).toBe(1);
    expect(m.recordScrapeOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 1,
        status: 'fetch_failed',
        message: 'HTTP 500',
      }),
    );
  });
});

describe('runNewsScrape — retention', () => {
  it('expires rows older than the window, using a cutoff 7 days back', async () => {
    m.listScrapeTargets.mockResolvedValue([]);
    m.deleteExpiredArticles.mockResolvedValue({ deleted: 12 });

    const result = await runNewsScrape({ budgetMs: 60_000, now: NOW });

    expect(result.expiredDeleted).toBe(12);
    expect(m.deleteExpiredArticles).toHaveBeenCalledWith(
      new Date('2026-07-27T04:00:00.000Z'),
    );
  });

  it('deletes only after writing, so a failed run never empties the feed', async () => {
    m.listScrapeTargets.mockResolvedValue([source({})]);
    m.extractNewsLinks.mockResolvedValue({
      ok: true,
      links: ['https://www.avweb.com/a'],
    });
    m.fetchPage.mockImplementation(async (url: string) =>
      url === 'https://www.avweb.com/'
        ? indexPage([])
        : articlePage({ url, title: 'A', published: '2026-08-02T00:00:00Z' }),
    );

    await runNewsScrape({ budgetMs: 60_000, now: NOW });

    const lastUpsert = Math.max(...m.upsertArticle.mock.invocationCallOrder);
    const firstDelete = m.deleteExpiredArticles.mock.invocationCallOrder[0];
    expect(firstDelete).toBeGreaterThan(lastUpsert);
  });
});

describe('runNewsScrape — cache outage', () => {
  /**
   * The production failure this guards. An unreachable Redis threw on the very
   * first `get` inside `isCrawlAllowed`, before a single page was fetched, and
   * all 14 sources came back `fetch_failed` citing a URL nobody here builds
   * ("Failed to parse URL from /pipeline" — @upstash/redis with no base URL).
   * A cache is an optimization; losing it must cost speed, not the whole run.
   */
  it('still scrapes when the cache is completely unavailable', async () => {
    m.redisGet.mockRejectedValue(
      new Error('Failed to parse URL from /pipeline'),
    );
    m.redisSet.mockRejectedValue(
      new Error('Failed to parse URL from /pipeline'),
    );
    m.listScrapeTargets.mockResolvedValue([source({})]);
    m.extractNewsLinks.mockResolvedValue({
      ok: true,
      links: ['https://www.avweb.com/a'],
    });
    m.fetchPage.mockImplementation(async (url: string) =>
      url === 'https://www.avweb.com/'
        ? indexPage([])
        : articlePage({
            url,
            title: 'Still scraped',
            published: '2026-08-02T00:00:00Z',
          }),
    );

    const result = await runNewsScrape({ budgetMs: 60_000, now: NOW });

    expect(result.articlesWritten).toBe(1);
    expect(m.upsertArticle).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Still scraped' }),
    );
    expect(m.recordScrapeOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok' }),
    );
  });

  it('reports the cache outage once rather than per source', async () => {
    m.redisGet.mockRejectedValue(new Error('boom'));
    m.listScrapeTargets.mockResolvedValue([
      source({ id: 1, url: 'https://www.avweb.com/' }),
      source({ id: 2, url: 'https://www.flyingmag.com/' }),
    ]);
    m.fetchPage.mockResolvedValue(indexPage([]));

    await runNewsScrape({ budgetMs: 60_000, now: NOW });

    const cacheWarnings = (
      console.warn as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.filter((c) => String(c[0]).includes('cache unavailable'));
    expect(cacheWarnings.length).toBeLessThanOrEqual(1);
  });
});
