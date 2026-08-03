import { createFileRoute } from '@tanstack/react-router';
import { env } from '#/env';
import { runNewsScrape } from '#/lib/news/scrape-run';

/**
 * How long the platform will let this function run. Set explicitly rather than
 * inherited: the run's own budget is derived from it, so an unstated default
 * changing underneath us would silently change when we stop.
 */
export const maxDuration = 300;

/**
 * Fraction of `maxDuration` the run may consume before it stops taking new
 * sources. The remainder covers the writes and the retention sweep still to
 * come after harvesting ends.
 */
const BUDGET_FRACTION = 0.8;

export async function newsScrapeCronHandler(
  request: Request,
): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await runNewsScrape({
    budgetMs: maxDuration * 1000 * BUDGET_FRACTION,
  });
  return Response.json(result);
}

/**
 * Vercel Cron endpoint: harvest news for every active source, dedup within
 * each course, then expire anything past the retention window. Stays disabled
 * (401) until CRON_SECRET is configured, matching `blob-sweep`.
 */
export const Route = createFileRoute('/api/cron/news-scrape')({
  server: {
    handlers: {
      GET: ({ request }) => newsScrapeCronHandler(request),
    },
  },
});
