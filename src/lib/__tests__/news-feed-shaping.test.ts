import { describe, expect, it } from 'vitest';
import {
  type FeedRow,
  latestFirstSeenAt,
  shapeNewsFeed,
} from '#/lib/news-feed-shaping';

const AVWEB = {
  id: 1,
  name: 'AVweb',
  imageUrlAvif: null,
  imageUrlWebp: null,
  imageUrl: null,
  tintColor: null,
};
const FLYING = {
  id: 2,
  name: 'Flying',
  imageUrlAvif: null,
  imageUrlWebp: null,
  imageUrl: null,
  tintColor: null,
};
const AOPA = {
  id: 3,
  name: 'AOPA',
  imageUrlAvif: null,
  imageUrlWebp: null,
  imageUrl: null,
  tintColor: null,
};

const row = (over: Partial<FeedRow> & { id: number }): FeedRow => ({
  title: `Story ${over.id}`,
  description: null,
  canonicalUrl: `https://example.test/${over.id}`,
  imageUrl: null,
  publishedAt: new Date('2026-08-02T00:00:00Z'),
  publishedAtEstimated: false,
  firstSeenAt: new Date('2026-08-03T04:00:00Z'),
  dedupeOfId: null,
  source: AVWEB,
  sourceRank: 1,
  ...over,
});

describe('shapeNewsFeed — clustering', () => {
  it('collapses a duplicate into the winner and credits the other source', () => {
    const articles = shapeNewsFeed([
      row({ id: 10, source: AVWEB, sourceRank: 1 }),
      row({ id: 11, source: FLYING, sourceRank: 2, dedupeOfId: 10 }),
    ]);

    expect(articles).toHaveLength(1);
    expect(articles[0].id).toBe(10);
    expect(articles[0].source.name).toBe('AVweb');
    expect(articles[0].alsoCoveredBy).toEqual([{ id: 2, name: 'Flying' }]);
  });

  /**
   * The rule from Q5. With a flat `dedupe_of_id IS NULL` filter this story
   * would vanish: the winner is gone for being muted and the runner-up is
   * discarded for being a duplicate — deleting Flying's coverage because of a
   * choice the student made about AVweb.
   */
  it('promotes the runner-up when the winner was filtered out', () => {
    const articles = shapeNewsFeed([
      // AVweb's row is absent: the caller filtered it (muted or inactive).
      row({ id: 11, source: FLYING, sourceRank: 2, dedupeOfId: 10 }),
    ]);

    expect(articles).toHaveLength(1);
    expect(articles[0].id).toBe(11);
    expect(articles[0].source.name).toBe('Flying');
    // Nothing to credit — AVweb is not visible to this student.
    expect(articles[0].alsoCoveredBy).toEqual([]);
  });

  it('promotes by source rank when several duplicates survive', () => {
    const articles = shapeNewsFeed([
      row({ id: 12, source: AOPA, sourceRank: 3, dedupeOfId: 10 }),
      row({ id: 11, source: FLYING, sourceRank: 2, dedupeOfId: 10 }),
    ]);

    expect(articles).toHaveLength(1);
    // Rank 2 beats rank 3 — the admin's ordering decides.
    expect(articles[0].source.name).toBe('Flying');
    expect(articles[0].alsoCoveredBy).toEqual([{ id: 3, name: 'AOPA' }]);
  });

  it('keeps a story whose original expired but whose duplicates remain', () => {
    // Article 10 was swept by retention; 11 and 12 still point at it.
    const articles = shapeNewsFeed([
      row({ id: 11, source: FLYING, sourceRank: 2, dedupeOfId: 10 }),
      row({ id: 12, source: AOPA, sourceRank: 3, dedupeOfId: 10 }),
    ]);
    expect(articles).toHaveLength(1);
    expect(articles[0].id).toBe(11);
  });

  it('does not merge unrelated stories', () => {
    const articles = shapeNewsFeed([
      row({ id: 10, source: AVWEB, sourceRank: 1 }),
      row({ id: 20, source: FLYING, sourceRank: 2 }),
    ]);
    expect(articles).toHaveLength(2);
    expect(articles.every((a) => a.alsoCoveredBy.length === 0)).toBe(true);
  });

  it('lists one publication once even if it ran two URLs for the story', () => {
    const articles = shapeNewsFeed([
      row({ id: 10, source: AVWEB, sourceRank: 1 }),
      row({ id: 11, source: FLYING, sourceRank: 2, dedupeOfId: 10 }),
      row({ id: 12, source: FLYING, sourceRank: 2, dedupeOfId: 10 }),
    ]);
    expect(articles[0].alsoCoveredBy).toEqual([{ id: 2, name: 'Flying' }]);
  });

  it('breaks a rank tie deterministically regardless of input order', () => {
    const rows = [
      row({
        id: 11,
        source: FLYING,
        sourceRank: 2,
        dedupeOfId: 10,
        publishedAt: new Date('2026-08-02T09:00:00Z'),
      }),
      row({
        id: 12,
        source: AOPA,
        sourceRank: 2,
        dedupeOfId: 10,
        publishedAt: new Date('2026-08-02T08:00:00Z'),
      }),
    ];
    // Same rank → earlier publication wins, whichever order rows arrive in.
    expect(shapeNewsFeed(rows)[0].id).toBe(12);
    expect(shapeNewsFeed([...rows].reverse())[0].id).toBe(12);
  });
});

describe('shapeNewsFeed — ordering and mapping', () => {
  it('orders newest first', () => {
    const articles = shapeNewsFeed([
      row({ id: 1, publishedAt: new Date('2026-07-30T00:00:00Z') }),
      row({ id: 2, publishedAt: new Date('2026-08-02T00:00:00Z') }),
      row({ id: 3, publishedAt: new Date('2026-08-01T00:00:00Z') }),
    ]);
    expect(articles.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('breaks a same-instant tie on source rank, then id', () => {
    const at = new Date('2026-08-02T00:00:00Z');
    const articles = shapeNewsFeed([
      row({ id: 5, publishedAt: at, source: AOPA, sourceRank: 3 }),
      row({ id: 6, publishedAt: at, source: FLYING, sourceRank: 2 }),
      row({ id: 4, publishedAt: at, source: FLYING, sourceRank: 2 }),
    ]);
    expect(articles.map((a) => a.id)).toEqual([4, 6, 5]);
  });

  it('carries publishedAtEstimated to the client', () => {
    // The UI must not render a discovery time as a publication time.
    const [article] = shapeNewsFeed([
      row({ id: 1, publishedAtEstimated: true }),
    ]);
    expect(article.publishedAtEstimated).toBe(true);
  });

  it('exposes canonicalUrl as url and never leaks originalUrl', () => {
    const [article] = shapeNewsFeed([
      row({ id: 1, canonicalUrl: 'https://avweb.test/story' }),
    ]);
    expect(article.url).toBe('https://avweb.test/story');
    expect(article).not.toHaveProperty('originalUrl');
  });

  it('returns nothing for no rows', () => {
    expect(shapeNewsFeed([])).toEqual([]);
  });
});

describe('latestFirstSeenAt', () => {
  it('returns the most recent firstSeenAt', () => {
    expect(
      latestFirstSeenAt([
        row({ id: 1, firstSeenAt: new Date('2026-08-01T00:00:00Z') }),
        row({ id: 2, firstSeenAt: new Date('2026-08-03T00:00:00Z') }),
        row({ id: 3, firstSeenAt: new Date('2026-08-02T00:00:00Z') }),
      ]),
    ).toEqual(new Date('2026-08-03T00:00:00Z'));
  });

  it('is null when there are no rows, so a dead cron is visible', () => {
    expect(latestFirstSeenAt([])).toBeNull();
  });

  it('counts a duplicate that lost its cluster — it still proves the cron ran', () => {
    expect(
      latestFirstSeenAt([
        row({
          id: 11,
          dedupeOfId: 10,
          firstSeenAt: new Date('2026-08-03T00:00:00Z'),
        }),
      ]),
    ).toEqual(new Date('2026-08-03T00:00:00Z'));
  });
});
