// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  runNewsScrape: vi.fn(),
  env: { CRON_SECRET: 'topsecret' } as { CRON_SECRET?: string },
}));
vi.mock('#/lib/news/scrape-run', () => ({ runNewsScrape: m.runNewsScrape }));
vi.mock('#/env', () => ({ env: m.env }));

import { maxDuration, newsScrapeCronHandler } from '../news-scrape';

const req = (authorization?: string) =>
  new Request('http://test/api/cron/news-scrape', {
    headers: authorization ? { authorization } : {},
  });

const RESULT = {
  sourcesConsidered: 2,
  sourcesProcessed: 2,
  sourcesSkipped: 0,
  articlesWritten: 6,
  duplicatesFound: 1,
  expiredDeleted: 4,
  budgetExhausted: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.env.CRON_SECRET = 'topsecret';
  m.runNewsScrape.mockResolvedValue(RESULT);
});

describe('newsScrapeCronHandler', () => {
  it('401s without the bearer token, and does not run', async () => {
    expect((await newsScrapeCronHandler(req())).status).toBe(401);
    expect(m.runNewsScrape).not.toHaveBeenCalled();
  });

  it('401s on a wrong token', async () => {
    const res = await newsScrapeCronHandler(req('Bearer wrong'));
    expect(res.status).toBe(401);
    expect(m.runNewsScrape).not.toHaveBeenCalled();
  });

  // Matches blob-sweep: an unset secret leaves the endpoint closed rather than
  // open, so a misconfigured deploy cannot be triggered by anyone.
  it('stays disabled when CRON_SECRET is unset', async () => {
    m.env.CRON_SECRET = undefined;
    const res = await newsScrapeCronHandler(req('Bearer topsecret'));
    expect(res.status).toBe(401);
    expect(m.runNewsScrape).not.toHaveBeenCalled();
  });

  it('runs with a budget strictly inside maxDuration', async () => {
    const res = await newsScrapeCronHandler(req('Bearer topsecret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);

    // The budget is the whole reason a timeout becomes a deferral rather than
    // a silent mid-flight kill — it must leave headroom for the writes and the
    // retention sweep that follow harvesting.
    const { budgetMs } = m.runNewsScrape.mock.calls[0][0];
    expect(budgetMs).toBeGreaterThan(0);
    expect(budgetMs).toBeLessThan(maxDuration * 1000);
  });
});
