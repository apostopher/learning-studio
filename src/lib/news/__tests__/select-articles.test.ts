import { describe, expect, it } from 'vitest';
import {
  type CandidateArticle,
  cosineSimilarity,
  DEDUPE_THRESHOLD,
  embeddingText,
  judgeDuplicate,
  selectTopArticles,
} from '#/lib/news/select-articles';

const NOW = new Date('2026-08-03T04:00:00.000Z');

const article = (
  overrides: Partial<CandidateArticle> & { canonicalUrl: string },
): CandidateArticle => ({
  originalUrl: overrides.canonicalUrl,
  title: 'Title',
  description: null,
  imageUrl: null,
  publishedAt: null,
  ...overrides,
});

describe('selectTopArticles', () => {
  it('takes the N most recently published', () => {
    const picked = selectTopArticles(
      [
        article({
          canonicalUrl: 'https://x.com/old',
          publishedAt: new Date('2026-07-01T00:00:00Z'),
        }),
        article({
          canonicalUrl: 'https://x.com/newest',
          publishedAt: new Date('2026-08-02T00:00:00Z'),
        }),
        article({
          canonicalUrl: 'https://x.com/middle',
          publishedAt: new Date('2026-08-01T00:00:00Z'),
        }),
      ],
      NOW,
      2,
    );
    expect(picked.map((a) => a.canonicalUrl)).toEqual([
      'https://x.com/newest',
      'https://x.com/middle',
    ]);
  });

  // The old implementation dropped these outright, so a publisher that omits
  // dates contributed nothing, forever, with no signal anywhere.
  it('keeps undated articles by falling back to firstSeenAt', () => {
    const picked = selectTopArticles(
      [article({ canonicalUrl: 'https://x.com/undated' })],
      NOW,
      3,
    );
    expect(picked).toHaveLength(1);
    expect(picked[0].effectivePublishedAt).toEqual(NOW);
    expect(picked[0].publishedAtEstimated).toBe(true);
  });

  it('marks dated articles as not estimated', () => {
    const published = new Date('2026-08-01T00:00:00Z');
    const picked = selectTopArticles(
      [article({ canonicalUrl: 'https://x.com/a', publishedAt: published })],
      NOW,
      3,
    );
    expect(picked[0].publishedAtEstimated).toBe(false);
    expect(picked[0].effectivePublishedAt).toEqual(published);
  });

  it('prefers a real date over an estimate at the same instant', () => {
    const picked = selectTopArticles(
      [
        article({ canonicalUrl: 'https://x.com/estimated' }),
        article({ canonicalUrl: 'https://x.com/dated', publishedAt: NOW }),
      ],
      NOW,
      1,
    );
    expect(picked[0].canonicalUrl).toBe('https://x.com/dated');
  });

  it('is deterministic for identical timestamps', () => {
    const inputs = [
      article({ canonicalUrl: 'https://x.com/b', publishedAt: NOW }),
      article({ canonicalUrl: 'https://x.com/a', publishedAt: NOW }),
    ];
    expect(
      selectTopArticles(inputs, NOW, 2).map((a) => a.canonicalUrl),
    ).toEqual(
      selectTopArticles([...inputs].reverse(), NOW, 2).map(
        (a) => a.canonicalUrl,
      ),
    );
  });

  it('does not mutate its input', () => {
    const inputs = [
      article({ canonicalUrl: 'https://x.com/a', publishedAt: NOW }),
      article({
        canonicalUrl: 'https://x.com/b',
        publishedAt: new Date('2026-07-01T00:00:00Z'),
      }),
    ];
    const snapshot = inputs.map((a) => a.canonicalUrl);
    selectTopArticles(inputs, NOW, 1);
    expect(inputs.map((a) => a.canonicalUrl)).toEqual(snapshot);
  });

  it('returns everything when there are fewer than the limit', () => {
    expect(
      selectTopArticles([article({ canonicalUrl: 'https://x.com/a' })], NOW, 3),
    ).toHaveLength(1);
  });

  it('returns nothing for no candidates', () => {
    expect(selectTopArticles([], NOW, 3)).toEqual([]);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('ignores magnitude', () => {
    expect(cosineSimilarity([1, 1], [5, 5])).toBeCloseTo(1);
  });
  it('is 0 for a zero vector rather than NaN', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
  it('is 0 for mismatched lengths rather than throwing', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('embeddingText', () => {
  it('joins title and description', () => {
    expect(
      embeddingText({ title: 'FAA rule', description: 'Details here' }),
    ).toBe('FAA rule\n\nDetails here');
  });
  it('omits a missing description without a trailing separator', () => {
    expect(embeddingText({ title: 'FAA rule', description: null })).toBe(
      'FAA rule',
    );
  });
});

describe('judgeDuplicate', () => {
  it('treats no matches as original', () => {
    expect(judgeDuplicate([])).toEqual({ dedupeOfId: null, nearMiss: null });
  });

  it('marks a match at or above the threshold as a duplicate', () => {
    expect(judgeDuplicate([{ id: 9, similarity: DEDUPE_THRESHOLD }])).toEqual({
      dedupeOfId: 9,
      nearMiss: null,
    });
  });

  // Matches ordered best-first, and the caller feeds database rows before
  // in-run articles — which is what makes "first-seen wins across runs, best
  // rank wins within a run" fall out without extra branching.
  it('picks the first match, which is the caller-supplied winner', () => {
    expect(
      judgeDuplicate([
        { id: 1, similarity: 0.95 },
        { id: 2, similarity: 0.99 },
      ]).dedupeOfId,
    ).toBe(1);
  });

  it('reports a near-miss without deduping it', () => {
    const verdict = judgeDuplicate([{ id: 4, similarity: 0.8 }]);
    expect(verdict.dedupeOfId).toBeNull();
    expect(verdict.nearMiss).toEqual({ id: 4, similarity: 0.8 });
  });

  it('stays silent below the near-miss floor', () => {
    expect(judgeDuplicate([{ id: 4, similarity: 0.5 }])).toEqual({
      dedupeOfId: null,
      nearMiss: null,
    });
  });

  it('honours an overridden threshold', () => {
    expect(judgeDuplicate([{ id: 4, similarity: 0.8 }], 0.75).dedupeOfId).toBe(
      4,
    );
  });
});
