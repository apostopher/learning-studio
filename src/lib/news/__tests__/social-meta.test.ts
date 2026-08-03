import { describe, expect, it } from 'vitest';
import { extractSocialMeta, parsePublishedAt } from '#/lib/news/social-meta';

const PAGE_URL = 'https://www.avweb.com/news/story';
const NOW = new Date('2026-08-03T04:00:00.000Z');

const page = (head: string) => `<html><head>${head}</head><body></body></html>`;

describe('extractSocialMeta', () => {
  it('reads Open Graph first', () => {
    const meta = extractSocialMeta(
      page(`
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Description">
        <meta property="og:image" content="https://cdn.avweb.com/a.jpg">
        <meta name="twitter:title" content="Twitter Title">
      `),
      PAGE_URL,
    );
    expect(meta.title).toBe('OG Title');
    expect(meta.description).toBe('OG Description');
    expect(meta.image).toBe('https://cdn.avweb.com/a.jpg');
  });

  it('falls back to Twitter cards, then to <title>', () => {
    expect(
      extractSocialMeta(
        page('<meta name="twitter:title" content="Twitter Title">'),
        PAGE_URL,
      ).title,
    ).toBe('Twitter Title');
    expect(
      extractSocialMeta(
        '<html><head><title>Plain</title></head></html>',
        PAGE_URL,
      ).title,
    ).toBe('Plain');
  });

  it('returns null rather than an empty string when nothing is present', () => {
    const meta = extractSocialMeta(page(''), PAGE_URL);
    expect(meta.title).toBeNull();
    expect(meta.description).toBeNull();
    expect(meta.image).toBeNull();
    expect(meta.canonical).toBeNull();
  });

  it('absolutizes a relative image against the page URL', () => {
    expect(
      extractSocialMeta(
        page('<meta property="og:image" content="/img/a.jpg">'),
        PAGE_URL,
      ).image,
    ).toBe('https://www.avweb.com/img/a.jpg');
  });

  it('extracts the canonical link, which dedup layer 1 depends on', () => {
    expect(
      extractSocialMeta(
        page('<link rel="canonical" href="/news/real-story">'),
        PAGE_URL,
      ).canonical,
    ).toBe('https://www.avweb.com/news/real-story');
  });

  it('reads article:published_time', () => {
    expect(
      extractSocialMeta(
        page(
          '<meta property="article:published_time" content="2026-08-01T09:00:00Z">',
        ),
        PAGE_URL,
      ).publishedTime,
    ).toBe('2026-08-01T09:00:00Z');
  });

  it('falls back to a <time datetime> element', () => {
    expect(
      extractSocialMeta(
        '<html><body><time datetime="2026-08-01">Aug 1</time></body></html>',
        PAGE_URL,
      ).publishedTime,
    ).toBe('2026-08-01');
  });

  it('reads datePublished out of JSON-LD, including nested graphs', () => {
    const html = page(`<script type="application/ld+json">
      {"@graph":[{"@type":"WebSite"},{"@type":"NewsArticle","datePublished":"2026-08-02T10:00:00Z"}]}
    </script>`);
    expect(extractSocialMeta(html, PAGE_URL).publishedTime).toBe(
      '2026-08-02T10:00:00Z',
    );
  });

  it('survives malformed JSON-LD instead of throwing', () => {
    const html = page(
      '<script type="application/ld+json">{ not json </script>',
    );
    expect(() => extractSocialMeta(html, PAGE_URL)).not.toThrow();
    expect(extractSocialMeta(html, PAGE_URL).publishedTime).toBeNull();
  });

  it('prefers meta tags over JSON-LD dateModified', () => {
    const html = page(`
      <meta property="article:published_time" content="2026-08-01T09:00:00Z">
      <script type="application/ld+json">{"dateModified":"2026-08-03T00:00:00Z"}</script>
    `);
    expect(extractSocialMeta(html, PAGE_URL).publishedTime).toBe(
      '2026-08-01T09:00:00Z',
    );
  });
});

describe('parsePublishedAt', () => {
  it('parses a valid ISO date', () => {
    expect(parsePublishedAt('2026-08-01T09:00:00Z', NOW)).toEqual(
      new Date('2026-08-01T09:00:00Z'),
    );
  });

  it('returns null for a missing or unparseable value', () => {
    expect(parsePublishedAt(null, NOW)).toBeNull();
    expect(parsePublishedAt('sometime last week', NOW)).toBeNull();
  });

  // Sites really do emit this. Treating it as real would make the article sort
  // last forever and, under a publishedAt retention rule, vanish on arrival.
  it('rejects the epoch and other pre-1995 dates', () => {
    expect(parsePublishedAt('1970-01-01', NOW)).toBeNull();
    expect(parsePublishedAt('1900-05-05T00:00:00Z', NOW)).toBeNull();
  });

  it('rejects dates far in the future', () => {
    expect(parsePublishedAt('2030-01-01T00:00:00Z', NOW)).toBeNull();
  });

  it('tolerates a day of skew for timezone-less dates ahead of UTC', () => {
    expect(parsePublishedAt('2026-08-03T20:00:00Z', NOW)).not.toBeNull();
  });
});
