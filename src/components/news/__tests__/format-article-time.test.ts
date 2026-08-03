import { describe, expect, it } from 'vitest';
import {
  formatArticleTime,
  formatDateline,
  formatLastUpdated,
} from '#/components/news/format-article-time';

const NOW = new Date('2026-08-08T12:00:00Z');

describe('formatArticleTime', () => {
  it('is relative within the last day', () => {
    const threeHoursAgo = new Date('2026-08-08T09:00:00Z');
    expect(formatArticleTime(threeHoursAgo, false, NOW)).toBe('3 hours ago');
  });

  it('is an absolute date beyond a day', () => {
    const lastWeek = new Date('2026-08-01T09:00:00Z');
    expect(formatArticleTime(lastWeek, false, NOW)).toBe('1 Aug');
  });

  /**
   * The rule this module exists for. An estimated timestamp is when the cron
   * DISCOVERED the article, not when it was published — rendering it as
   * "3 hours ago" fabricates a precision the source never gave us.
   */
  it('never renders an estimated date as a relative time', () => {
    const threeHoursAgo = new Date('2026-08-08T09:00:00Z');
    const out = formatArticleTime(threeHoursAgo, true, NOW);
    expect(out).toBe('Added 8 Aug');
    expect(out).not.toMatch(/ago/);
    expect(out).not.toMatch(/hour/);
  });

  it('labels estimated dates as Added, not Published', () => {
    expect(formatArticleTime(new Date('2026-08-02T00:00:00Z'), true, NOW)).toBe(
      'Added 2 Aug',
    );
  });
});

describe('formatLastUpdated', () => {
  it('is null when nothing has ever been scraped', () => {
    expect(formatLastUpdated(null, NOW)).toBeNull();
  });

  it('reads "just now" within the hour', () => {
    expect(formatLastUpdated(new Date('2026-08-08T11:40:00Z'), NOW)).toBe(
      'Updated just now',
    );
  });

  // The dead-cron signal, in front of real eyes rather than buried in logs.
  it('shows how stale a dead cron has left the feed', () => {
    expect(formatLastUpdated(new Date('2026-08-04T12:00:00Z'), NOW)).toBe(
      'Updated 4 days ago',
    );
  });
});

describe('formatDateline', () => {
  it('is a long-form newspaper dateline', () => {
    expect(formatDateline(NOW)).toBe('Saturday, 8 August 2026');
  });
});
