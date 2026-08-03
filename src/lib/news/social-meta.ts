import * as cheerio from 'cheerio';

export interface SocialMeta {
  title: string | null;
  image: string | null;
  description: string | null;
  /** ISO-ish string exactly as the page published it; parsed by the caller. */
  publishedTime: string | null;
  /** `<link rel="canonical">`, absolute-ized against the page URL. */
  canonical: string | null;
}

/** Resolve a possibly-relative URL against the page it was found on. */
const absolutize = (value: string | null, baseUrl: string): string | null => {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
};

/**
 * Read the structured facts a publisher already exposes for sharing.
 *
 * This is why the pipeline fetches article pages at all: the model extracts
 * links, but title/image/description/date come from here — verifiable markup
 * rather than model output, so none of it can be hallucinated.
 *
 * Ported from `airmanship-web/src/server/scraper.ts`, with canonical-link
 * extraction added (dedup layer 1 needs it) and the body-text date-regex
 * fallback deliberately dropped — matching the first `YYYY-MM-DD` anywhere in
 * a page's text finds copyright lines and unrelated article teasers at least as
 * often as a publication date.
 */
export function extractSocialMeta(html: string, pageUrl: string): SocialMeta {
  const $ = cheerio.load(html);

  const meta = (attr: 'name' | 'property', value: string): string | null =>
    $(`meta[${attr}="${value}"]`).attr('content')?.trim() || null;

  const title =
    meta('property', 'og:title') ??
    meta('name', 'twitter:title') ??
    $('title').first().text().trim() ??
    null;

  const image =
    meta('property', 'og:image:secure_url') ??
    meta('property', 'og:image') ??
    meta('property', 'og:image:url') ??
    meta('name', 'twitter:image') ??
    meta('name', 'twitter:image:src');

  const description =
    meta('property', 'og:description') ??
    meta('name', 'twitter:description') ??
    meta('name', 'description');

  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;

  return {
    title: title || null,
    image: absolutize(image, pageUrl),
    description: description || null,
    publishedTime: extractPublishedDate($),
    canonical: absolutize(canonical, pageUrl),
  };
}

function extractPublishedDate($: cheerio.CheerioAPI): string | null {
  const candidates = [
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[property="datePublished"]').attr('content'),
    $('meta[itemprop="datePublished"]').attr('content'),
    $('meta[name="DC.date.issued"]').attr('content'),
    $('meta[name="publication_date"]').attr('content'),
    $('meta[name="date"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }

  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const raw = scripts.eq(i).html();
    if (!raw) continue;
    try {
      const found = findDateInJsonLd(JSON.parse(raw));
      if (found) return found;
    } catch {
      // A malformed JSON-LD block is common and not worth failing over.
    }
  }
  return null;
}

/** Walk JSON-LD for a publication date, bounded so a cyclic graph can't hang. */
function findDateInJsonLd(data: unknown, depth = 0): string | null {
  if (depth > 5 || typeof data !== 'object' || data === null) return null;

  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = findDateInJsonLd(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;
  // Ordered by trustworthiness: dateModified is a last resort, since a page
  // edited today may have been published years ago.
  for (const key of ['datePublished', 'dateCreated', 'dateModified']) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const value of Object.values(obj)) {
    const found = findDateInJsonLd(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Parse a publisher-supplied date string, rejecting values that parse but are
 * obviously not a publication date.
 *
 * `new Date('1970-01-01')` succeeds, and sites do emit it. Treating that as
 * real would make the article sort last forever and be deleted the instant it
 * arrives under a `publishedAt` retention rule — so it is treated as absent.
 */
export function parsePublishedAt(value: string | null, now: Date): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getUTCFullYear();
  if (year < 1995) return null;
  // A day of tolerance for clock skew and timezone-less dates published
  // "today" in a zone ahead of UTC.
  if (parsed.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return null;
  return parsed;
}
