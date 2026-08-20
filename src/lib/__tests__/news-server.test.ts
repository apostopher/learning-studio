// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getUserRoleNames: vi.fn(),
  getCourseIdentityBySlug: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getMutedSourceIds: vi.fn(),
  getSourceCourseId: vi.fn(),
  listCourseSourceChoices: vi.fn(),
  listVisibleFeedRows: vi.fn(),
  setSourceMuted: vi.fn(),
  isCourseStaff: vi.fn(),
}));

vi.mock('#/db/admin', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/course', () => ({
  getCourseIdentityBySlug: m.getCourseIdentityBySlug,
}));
vi.mock('#/db/lesson-access', () => ({
  isSubscribedToCourse: m.isSubscribedToCourse,
}));
// The course-staff bypass runs for every non-admin, so the real (drizzle-
// backed) module would otherwise open a database connection here.
vi.mock('#/db/course-staff', () => ({ isCourseStaff: m.isCourseStaff }));
vi.mock('#/db/news-articles', () => ({ RETENTION_DAYS: 7 }));
vi.mock('#/db/news-feed', () => ({
  getMutedSourceIds: m.getMutedSourceIds,
  getSourceCourseId: m.getSourceCourseId,
  listCourseSourceChoices: m.listCourseSourceChoices,
  listVisibleFeedRows: m.listVisibleFeedRows,
  setSourceMuted: m.setSourceMuted,
}));

import { getNewsForUser, setNewsSourceMuted } from '#/lib/news.server';

const NOW = new Date('2026-08-03T04:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseIdentityBySlug.mockResolvedValue({ id: 7, name: 'RPL' });
  m.getUserRoleNames.mockResolvedValue([]);
  m.isSubscribedToCourse.mockResolvedValue(true);
  m.getMutedSourceIds.mockResolvedValue([]);
  m.listVisibleFeedRows.mockResolvedValue([]);
  m.listCourseSourceChoices.mockResolvedValue([]);
  m.setSourceMuted.mockResolvedValue(undefined);
  m.isCourseStaff.mockResolvedValue(false);
});

describe('getNewsForUser — access', () => {
  it('returns null for a course that does not exist', async () => {
    m.getCourseIdentityBySlug.mockResolvedValue(null);
    expect(
      await getNewsForUser({ userId: 'u1', courseSlug: 'nope' }),
    ).toBeNull();
    expect(m.listVisibleFeedRows).not.toHaveBeenCalled();
  });

  it('returns empty arrays for a non-subscriber, and reads no articles', async () => {
    m.isSubscribedToCourse.mockResolvedValue(false);
    const result = await getNewsForUser({ userId: 'u1', courseSlug: 'rpl' });
    expect(result).toEqual({
      articles: [],
      sources: [],
      lastUpdatedAt: null,
      adminBypass: false,
    });
    // The important half: no query ran, so nothing could leak.
    expect(m.listVisibleFeedRows).not.toHaveBeenCalled();
    expect(m.listCourseSourceChoices).not.toHaveBeenCalled();
  });

  it('lets an unsubscribed admin read, and says so', async () => {
    m.isSubscribedToCourse.mockResolvedValue(false);
    m.getUserRoleNames.mockResolvedValue(['admin']);
    const result = await getNewsForUser({ userId: 'a1', courseSlug: 'rpl' });
    expect(result?.adminBypass).toBe(true);
    expect(m.listVisibleFeedRows).toHaveBeenCalled();
  });

  it('does not flag a bypass for an admin who is subscribed', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);
    const result = await getNewsForUser({ userId: 'a1', courseSlug: 'rpl' });
    expect(result?.adminBypass).toBe(false);
  });

  it('lets an unsubscribed subject expert read their own course, and says so', async () => {
    m.isSubscribedToCourse.mockResolvedValue(false);
    m.isCourseStaff.mockResolvedValue(true);
    const result = await getNewsForUser({ userId: 'u1', courseSlug: 'rpl' });
    expect(result?.adminBypass).toBe(true);
    expect(m.listVisibleFeedRows).toHaveBeenCalled();
    // Asked about THIS course — a grant on another one must not reach here.
    expect(m.isCourseStaff).toHaveBeenCalledWith('u1', 7);
  });

  it('gives a subject expert nothing from a course they do not staff', async () => {
    // Staff on course 99, asking about course 7, and not enrolled in it: the
    // same empty feed any other stranger gets, and no query runs.
    m.isSubscribedToCourse.mockResolvedValue(false);
    m.isCourseStaff.mockImplementation(
      async (_userId: string, courseId: number) => courseId === 99,
    );
    const result = await getNewsForUser({ userId: 'u1', courseSlug: 'rpl' });
    expect(result).toEqual({
      articles: [],
      sources: [],
      lastUpdatedAt: null,
      adminBypass: false,
    });
    expect(m.listVisibleFeedRows).not.toHaveBeenCalled();
  });

  it('does not query staff for an admin — they bypass on role alone', async () => {
    m.isSubscribedToCourse.mockResolvedValue(false);
    m.getUserRoleNames.mockResolvedValue(['admin']);
    await getNewsForUser({ userId: 'a1', courseSlug: 'rpl' });
    expect(m.isCourseStaff).not.toHaveBeenCalled();
  });
});

describe('getNewsForUser — query inputs', () => {
  it('scopes the article query to the course and a 7-day window', async () => {
    await getNewsForUser({ userId: 'u1', courseSlug: 'rpl', now: NOW });
    // Assert on what the query RECEIVED — the window is what stops a dead
    // cron's month-old rows resurfacing.
    expect(m.listVisibleFeedRows).toHaveBeenCalledWith({
      courseId: 7,
      since: new Date('2026-07-27T04:00:00.000Z'),
      mutedSourceIds: [],
    });
  });

  it('passes the student muted ids into the article query', async () => {
    m.getMutedSourceIds.mockResolvedValue([3, 9]);
    await getNewsForUser({ userId: 'u1', courseSlug: 'rpl', now: NOW });
    expect(m.listVisibleFeedRows).toHaveBeenCalledWith(
      expect.objectContaining({ mutedSourceIds: [3, 9] }),
    );
    // ...and into the picker, so the two cannot disagree.
    expect(m.listCourseSourceChoices).toHaveBeenCalledWith({
      courseId: 7,
      mutedIds: [3, 9],
    });
  });

  it('reads muted ids scoped to this user and course', async () => {
    await getNewsForUser({ userId: 'u1', courseSlug: 'rpl', now: NOW });
    expect(m.getMutedSourceIds).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
    });
  });

  it('reports lastUpdatedAt from the rows', async () => {
    m.listVisibleFeedRows.mockResolvedValue([
      {
        id: 1,
        title: 'A',
        description: null,
        canonicalUrl: 'https://x.test/a',
        imageUrl: null,
        publishedAt: NOW,
        publishedAtEstimated: false,
        firstSeenAt: new Date('2026-08-03T00:00:00Z'),
        dedupeOfId: null,
        source: {
          id: 1,
          name: 'AVweb',
          imageUrlAvif: null,
          imageUrlWebp: null,
          imageUrl: null,
          tintColor: null,
        },
        sourceRank: 1,
      },
    ]);
    const result = await getNewsForUser({
      userId: 'u1',
      courseSlug: 'rpl',
      now: NOW,
    });
    expect(result?.lastUpdatedAt).toEqual(new Date('2026-08-03T00:00:00Z'));
    expect(result?.articles).toHaveLength(1);
  });

  it('reports a null lastUpdatedAt when nothing has been scraped', async () => {
    const result = await getNewsForUser({ userId: 'u1', courseSlug: 'rpl' });
    expect(result?.lastUpdatedAt).toBeNull();
  });
});

describe('setNewsSourceMuted', () => {
  beforeEach(() => {
    m.getSourceCourseId.mockResolvedValue(7);
  });

  it('writes an exclusion for a source in a subscribed course', async () => {
    const result = await setNewsSourceMuted({
      userId: 'u1',
      sourceId: 5,
      muted: true,
    });
    expect(result).toEqual({ ok: true, sourceId: 5, muted: true });
    expect(m.setSourceMuted).toHaveBeenCalledWith({
      userId: 'u1',
      sourceId: 5,
      muted: true,
    });
  });

  it('removes the exclusion when unmuting', async () => {
    await setNewsSourceMuted({ userId: 'u1', sourceId: 5, muted: false });
    expect(m.setSourceMuted).toHaveBeenCalledWith(
      expect.objectContaining({ muted: false }),
    );
  });

  it('refuses a source that does not exist', async () => {
    m.getSourceCourseId.mockResolvedValue(null);
    expect(
      await setNewsSourceMuted({ userId: 'u1', sourceId: 999, muted: true }),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(m.setSourceMuted).not.toHaveBeenCalled();
  });

  /**
   * Same result as "does not exist", deliberately: a different outcome here
   * would let a learner enumerate which source ids exist in other courses.
   */
  it('refuses a source in a course the learner is not in, indistinguishably', async () => {
    m.isSubscribedToCourse.mockResolvedValue(false);
    expect(
      await setNewsSourceMuted({ userId: 'u1', sourceId: 5, muted: true }),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(m.setSourceMuted).not.toHaveBeenCalled();
  });

  it('lets an admin mute a source in a course they are not subscribed to', async () => {
    m.isSubscribedToCourse.mockResolvedValue(false);
    m.getUserRoleNames.mockResolvedValue(['admin']);
    const result = await setNewsSourceMuted({
      userId: 'a1',
      sourceId: 5,
      muted: true,
    });
    expect(result.ok).toBe(true);
  });

  it('lets a subject expert mute a source in the course they staff', async () => {
    m.isSubscribedToCourse.mockResolvedValue(false);
    m.isCourseStaff.mockResolvedValue(true);
    const result = await setNewsSourceMuted({
      userId: 'u1',
      sourceId: 5,
      muted: true,
    });
    expect(result.ok).toBe(true);
    expect(m.setSourceMuted).toHaveBeenCalledWith({
      userId: 'u1',
      sourceId: 5,
      muted: true,
    });
    // The source's own course id, resolved from the source — not any course
    // the caller happens to staff.
    expect(m.isCourseStaff).toHaveBeenCalledWith('u1', 7);
  });

  it('refuses a subject expert a source in a course they do not staff', async () => {
    m.isSubscribedToCourse.mockResolvedValue(false);
    m.isCourseStaff.mockImplementation(
      async (_userId: string, courseId: number) => courseId === 99,
    );
    expect(
      await setNewsSourceMuted({ userId: 'u1', sourceId: 5, muted: true }),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(m.setSourceMuted).not.toHaveBeenCalled();
  });

  it('asks nothing of the staff table for a subscriber or an admin', async () => {
    // The common caller is an enrolled learner; neither they nor an admin
    // should pay a query for a question already settled.
    await setNewsSourceMuted({ userId: 'u1', sourceId: 5, muted: true });
    expect(m.isCourseStaff).not.toHaveBeenCalled();

    m.isSubscribedToCourse.mockResolvedValue(false);
    m.getUserRoleNames.mockResolvedValue(['owner']);
    await setNewsSourceMuted({ userId: 'a1', sourceId: 5, muted: true });
    expect(m.isCourseStaff).not.toHaveBeenCalled();
  });
});
