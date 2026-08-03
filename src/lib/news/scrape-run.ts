import { embed } from 'ai';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

import { embeddingModel } from '#/ai/gemini';
import { extractNewsLinks } from '#/ai/news-links';
import {
  deleteExpiredArticles,
  findSimilarArticles,
  listScrapeTargets,
  RETENTION_DAYS,
  recordScrapeOutcome,
  upsertArticle,
} from '#/db/news-articles';
import { redis } from '#/integrations/upstash/redis';
import type { NewsScrapeStatus } from '#/types';
import { canonicalizeUrl, isSameSite } from './canonical-url';
import { fetchPage } from './fetch-page';
import { isCrawlAllowed } from './robots';
import {
  type CandidateArticle,
  DEDUPE_THRESHOLD,
  embeddingText,
  judgeDuplicate,
  type RankedArticle,
  selectTopArticles,
} from './select-articles';
import { extractSocialMeta, parsePublishedAt } from './social-meta';

/** Articles kept per source per run. */
export const ARTICLES_PER_SOURCE = 3;
/** Candidate links fetched before selection, so failures don't cost a slot. */
export const MAX_CANDIDATE_LINKS = 20;
const SOURCE_CONCURRENCY = 3;
const ARTICLE_CONCURRENCY = 3;
/** Shared across courses: two courses tracking one URL scrape it once. */
const INDEX_CACHE_TTL_SECONDS = 20 * 60 * 60;

export interface ScrapeRunResult {
  sourcesConsidered: number;
  sourcesProcessed: number;
  sourcesSkipped: number;
  articlesWritten: number;
  duplicatesFound: number;
  expiredDeleted: number;
  budgetExhausted: boolean;
}

interface Deadline {
  expired: () => boolean;
}

const makeDeadline = (startedAt: number, budgetMs: number): Deadline => ({
  expired: () => Date.now() - startedAt >= budgetMs,
});

/**
 * Fetch a source's index page, sharing the result across courses.
 *
 * Two courses tracking AVweb are two rows with one URL. Without this cache the
 * page is fetched and sent to the model twice a day for identical output.
 */
async function loadIndexHtml(
  url: string,
): Promise<{ ok: true; html: string } | { ok: false; reason: string }> {
  const key = `news:index:${url}`;
  const cached = await redis.get<string>(key);
  if (typeof cached === 'string' && cached.length > 0) {
    return { ok: true, html: cached };
  }

  const result = await fetchPage(url, { timeoutMs: 20_000 });
  if (!result.ok) return result;

  // Cache the stripped HTML, not the raw page — it is what the model sees, and
  // it is far smaller.
  const stripped = stripIndexHtml(result.html, null);
  await redis.set(key, stripped, { ex: INDEX_CACHE_TTL_SECONDS });
  return { ok: true, html: stripped };
}

/** Drop chrome the model never needs, then optionally narrow to selectors. */
export function stripIndexHtml(
  html: string,
  selectors: string[] | null,
): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg, nav, header, footer').remove();
  if (selectors && selectors.length > 0) {
    const narrowed = selectors.map((s) => $(s).html() ?? '').join('');
    if (narrowed.trim().length > 0) return narrowed;
    // A selector that matches nothing falls back to the whole page rather than
    // yielding an empty document — a stale selector should degrade, not blind
    // the source.
  }
  return $('body').html() ?? '';
}

/** Resolve one candidate link to an article, or null if it isn't usable. */
async function resolveArticle(
  link: string,
  sourceUrl: string,
  now: Date,
): Promise<CandidateArticle | null> {
  // Same-site guard runs BEFORE any fetch: this is the boundary that keeps a
  // prompt-injected page from steering the server at arbitrary hosts.
  if (!isSameSite(link, sourceUrl)) return null;

  const page = await fetchPage(link, { timeoutMs: 15_000 });
  if (!page.ok) return null;

  const meta = extractSocialMeta(page.html, page.finalUrl);
  if (!meta.title) return null;

  // Prefer the publisher's own canonical — it collapses syndicated reprints
  // that reach us under different URLs.
  const canonicalSource = meta.canonical ?? page.finalUrl;
  // A canonical pointing off-site is either syndication metadata or an
  // injection; either way we keep our own URL rather than trusting it.
  const canonical = canonicalizeUrl(
    isSameSite(canonicalSource, sourceUrl) ? canonicalSource : page.finalUrl,
  );
  if (!canonical) return null;

  return {
    canonicalUrl: canonical,
    originalUrl: link,
    title: meta.title,
    description: meta.description,
    imageUrl: meta.image,
    publishedAt: parsePublishedAt(meta.publishedTime, now),
  };
}

/** Everything one source contributes, before dedup. */
async function harvestSource(
  source: { id: number; url: string; selectors: string[] | null },
  now: Date,
): Promise<{
  status: NewsScrapeStatus;
  message: string | null;
  articles: RankedArticle[];
}> {
  if (!(await isCrawlAllowed(source.url))) {
    return {
      status: 'blocked_by_robots',
      message: "This site's robots.txt disallows crawling.",
      articles: [],
    };
  }

  const index = await loadIndexHtml(source.url);
  if (!index.ok) {
    return { status: 'fetch_failed', message: index.reason, articles: [] };
  }

  const html =
    source.selectors && source.selectors.length > 0
      ? stripIndexHtml(index.html, source.selectors)
      : index.html;

  const extracted = await extractNewsLinks(html);
  if (!extracted.ok) {
    return {
      status: 'fetch_failed',
      message: extracted.error ?? 'Link extraction failed.',
      articles: [],
    };
  }

  const seen = new Set<string>();
  const links: string[] = [];
  for (const raw of extracted.links) {
    const canonical = canonicalizeUrl(raw);
    if (!canonical || seen.has(canonical)) continue;
    if (!isSameSite(canonical, source.url)) continue;
    seen.add(canonical);
    links.push(canonical);
    if (links.length >= MAX_CANDIDATE_LINKS) break;
  }

  if (links.length === 0) {
    return {
      status: 'no_links_found',
      message:
        'No article links were found on this page. It may render its list in the browser rather than on the server.',
      articles: [],
    };
  }

  const limit = pLimit(ARTICLE_CONCURRENCY);
  const resolved = await Promise.all(
    links.map((link) => limit(() => resolveArticle(link, source.url, now))),
  );
  const candidates = resolved.filter((a): a is CandidateArticle => a !== null);

  if (candidates.length === 0) {
    return {
      status: 'fetch_failed',
      message: 'Every article page failed to load or carried no title.',
      articles: [],
    };
  }

  const top = selectTopArticles(candidates, now, ARTICLES_PER_SOURCE);
  const allEstimated = top.every((a) => a.publishedAtEstimated);
  return {
    status: allEstimated ? 'no_dated_articles' : 'ok',
    message: allEstimated
      ? 'No article carried a publication date; ordering falls back to when each was discovered.'
      : null,
    articles: top,
  };
}

/**
 * One full pass: harvest every active source stalest-first, dedup within each
 * course, then expire old rows.
 *
 * The wall-clock budget is the point. A timeout is the failure mode that
 * reports nothing — the function is killed mid-flight, some sources are
 * written and some are not, and nothing anywhere says so. Stopping voluntarily
 * turns that into a delay that self-corrects, because unprocessed sources are
 * by definition the stalest and go first next time.
 */
export async function runNewsScrape({
  budgetMs,
  now = new Date(),
}: {
  budgetMs: number;
  now?: Date;
}): Promise<ScrapeRunResult> {
  const deadline = makeDeadline(Date.now(), budgetMs);
  const targets = await listScrapeTargets();

  const result: ScrapeRunResult = {
    sourcesConsidered: targets.length,
    sourcesProcessed: 0,
    sourcesSkipped: 0,
    articlesWritten: 0,
    duplicatesFound: 0,
    expiredDeleted: 0,
    budgetExhausted: false,
  };

  const since = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const limit = pLimit(SOURCE_CONCURRENCY);
  const skipped: string[] = [];

  // Harvesting is concurrent, but writes are serialized below: dedup compares
  // each article against the ones already accepted, so it cannot be racing
  // itself.
  const harvests = await Promise.all(
    targets.map((target) =>
      limit(async () => {
        if (deadline.expired()) {
          skipped.push(target.url);
          return null;
        }
        try {
          const harvest = await harvestSource(target, now);
          return { target, harvest };
        } catch (error) {
          return {
            target,
            harvest: {
              status: 'fetch_failed' as NewsScrapeStatus,
              message:
                error instanceof Error ? error.message : 'Unexpected failure.',
              articles: [] as RankedArticle[],
            },
          };
        }
      }),
    ),
  );

  result.sourcesSkipped = skipped.length;
  result.budgetExhausted = skipped.length > 0;
  if (skipped.length > 0) {
    console.warn(
      `[news-scrape] time budget exhausted; ${skipped.length} source(s) deferred to the next run: ${skipped.join(', ')}`,
    );
  }

  // Serialized, ordered by source rank so that within this run the
  // better-ranked source wins a tie. Across runs, whatever is already in the
  // database wins, because it is matched first.
  const ordered = harvests
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.target.rank - b.target.rank);

  for (const { target, harvest } of ordered) {
    result.sourcesProcessed += 1;
    try {
      for (const article of harvest.articles) {
        const written = await writeArticle({
          article,
          courseId: target.courseId,
          sourceId: target.id,
          since,
        });
        result.articlesWritten += 1;
        if (written.wasDuplicate) result.duplicatesFound += 1;
      }
      await recordScrapeOutcome({
        sourceId: target.id,
        status: harvest.status,
        message: harvest.message,
        at: now,
      });
    } catch (error) {
      console.error(`[news-scrape] writing ${target.url} failed`, error);
      await recordScrapeOutcome({
        sourceId: target.id,
        status: 'fetch_failed',
        message: error instanceof Error ? error.message : 'Write failed.',
        at: now,
      }).catch(() => {});
    }
  }

  // Cleanup runs LAST, after writes: a run that failed wholesale must not
  // delete yesterday's news without having replaced it.
  const { deleted } = await deleteExpiredArticles(since);
  result.expiredDeleted = deleted;

  return result;
}

async function writeArticle(args: {
  article: RankedArticle;
  courseId: number;
  sourceId: number;
  since: Date;
}): Promise<{ wasDuplicate: boolean }> {
  const { article, courseId, sourceId, since } = args;

  let embedding: number[] | null = null;
  let dedupeOfId: number | null = null;

  try {
    const { embedding: vector } = await embed({
      model: embeddingModel,
      value: embeddingText(article),
      providerOptions: { google: { outputDimensionality: 3072 } },
    });
    embedding = vector;

    const matches = await findSimilarArticles({
      courseId,
      embedding: vector,
      since,
    });
    const verdict = judgeDuplicate(matches, DEDUPE_THRESHOLD);
    dedupeOfId = verdict.dedupeOfId;
    if (verdict.nearMiss) {
      // The band that would flip if the threshold moved. Logged so the value
      // can be tuned against real hauls instead of staying a guess.
      console.info(
        `[news-scrape] near-miss ${verdict.nearMiss.similarity.toFixed(3)} between "${article.title}" and article ${verdict.nearMiss.id}`,
      );
    }
  } catch (error) {
    // An embedding failure must not lose the article. It is stored without a
    // vector, which means it takes no part in dedup — a possible duplicate is
    // a far smaller loss than a missing story.
    console.error(
      `[news-scrape] embedding failed for ${article.canonicalUrl}`,
      error,
    );
  }

  await upsertArticle({
    courseId,
    newsSourceId: sourceId,
    canonicalUrl: article.canonicalUrl,
    originalUrl: article.originalUrl,
    title: article.title,
    description: article.description,
    imageUrl: article.imageUrl,
    publishedAt: article.effectivePublishedAt,
    publishedAtEstimated: article.publishedAtEstimated,
    embedding,
    dedupeOfId,
  });

  return { wasDuplicate: dedupeOfId !== null };
}
