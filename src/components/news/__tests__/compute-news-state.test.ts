import { describe, expect, it } from 'vitest';
import { computeNewsState } from '#/components/news/compute-news-state';
import type {
  NewsArticle,
  NewsFeedResponse,
  NewsSourceChoice,
} from '#/lib/news-schemas';

const source = (id: number, muted = false): NewsSourceChoice => ({
  id,
  name: `Source ${id}`,
  imageUrlAvif: null,
  imageUrlWebp: null,
  imageUrl: null,
  tintColor: null,
  muted,
});

const article = (id: number): NewsArticle => ({
  id,
  title: `Story ${id}`,
  description: null,
  url: `https://example.test/${id}`,
  imageUrl: null,
  publishedAt: new Date('2026-08-08T00:00:00Z'),
  publishedAtEstimated: false,
  source: source(1),
  alsoCoveredBy: [],
});

const feed = (over: Partial<NewsFeedResponse> = {}): NewsFeedResponse => ({
  articles: [],
  sources: [],
  lastUpdatedAt: null,
  adminBypass: false,
  ...over,
});

describe('computeNewsState — query states', () => {
  it('is loading while the query is in flight', () => {
    expect(
      computeNewsState({ isLoading: true, isError: false, data: undefined })
        .kind,
    ).toBe('loading');
  });

  it('is loading when data is absent even if not flagged loading', () => {
    expect(
      computeNewsState({ isLoading: false, isError: false, data: undefined })
        .kind,
    ).toBe('loading');
  });

  it('errors when the first load fails', () => {
    expect(
      computeNewsState({ isLoading: false, isError: true, data: undefined })
        .kind,
    ).toBe('error');
  });

  /**
   * A background refetch that fails leaves isError true while good data is
   * still cached. Blanking a populated page for that is worse than showing
   * slightly stale news.
   */
  it('keeps showing stories when a background refetch fails', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: true,
      data: feed({ articles: [article(1)], sources: [source(1)] }),
    });
    expect(state.kind).toBe('stories');
  });
});

describe('computeNewsState — the four empty states', () => {
  it('reports no-sources when the course has none configured', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({ sources: [] }),
    });
    expect(state).toMatchObject({ kind: 'empty', reason: 'no-sources' });
  });

  it('reports no-articles when sources exist but nothing was scraped', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({ sources: [source(1), source(2)] }),
    });
    expect(state).toMatchObject({ kind: 'empty', reason: 'no-articles' });
  });

  it('reports all-muted when the student has hidden every source', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({ sources: [source(1, true), source(2, true)] }),
    });
    expect(state).toMatchObject({
      kind: 'empty',
      reason: 'all-muted',
      mutedCount: 2,
    });
  });

  /**
   * An empty source list cannot be "all muted". Reporting it that way would
   * offer an unmute affordance with nothing to unmute.
   */
  it('does not call a course with zero sources all-muted', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({ sources: [] }),
    });
    expect(state).toMatchObject({ reason: 'no-sources' });
  });

  it('reports no-articles when only some sources are muted', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({ sources: [source(1, true), source(2)] }),
    });
    expect(state).toMatchObject({ reason: 'no-articles', mutedCount: 1 });
  });
});

describe('computeNewsState — story layout split', () => {
  it('gives the lead, the second and the rest', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({
        articles: [article(1), article(2), article(3), article(4)],
        sources: [source(1)],
      }),
    });
    expect(state).toMatchObject({ kind: 'stories' });
    if (state.kind !== 'stories') return;
    expect(state.lead.id).toBe(1);
    expect(state.second?.id).toBe(2);
    expect(state.rest.map((a) => a.id)).toEqual([3, 4]);
  });

  it('renders a lone article as a lead with no second and no grid', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({ articles: [article(1)], sources: [source(1)] }),
    });
    if (state.kind !== 'stories') throw new Error('expected stories');
    expect(state.lead.id).toBe(1);
    expect(state.second).toBeNull();
    expect(state.rest).toEqual([]);
  });

  it('renders exactly two as lead + second with an empty grid', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({ articles: [article(1), article(2)], sources: [source(1)] }),
    });
    if (state.kind !== 'stories') throw new Error('expected stories');
    expect(state.second?.id).toBe(2);
    expect(state.rest).toEqual([]);
  });

  it('counts visible sources as total minus muted', () => {
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({
        articles: [article(1)],
        sources: [source(1), source(2, true), source(3, true)],
      }),
    });
    if (state.kind !== 'stories') throw new Error('expected stories');
    expect(state.visibleSourceCount).toBe(1);
    expect(state.mutedCount).toBe(2);
  });

  it('passes lastUpdatedAt through for the dateline', () => {
    const at = new Date('2026-08-08T04:00:00Z');
    const state = computeNewsState({
      isLoading: false,
      isError: false,
      data: feed({
        articles: [article(1)],
        sources: [source(1)],
        lastUpdatedAt: at,
      }),
    });
    if (state.kind !== 'stories') throw new Error('expected stories');
    expect(state.lastUpdatedAt).toEqual(at);
  });
});
