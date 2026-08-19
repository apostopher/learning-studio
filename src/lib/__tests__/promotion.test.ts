// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getCurrentLevel: vi.fn(),
  insertEarnedLevelRow: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  getCourseIdentityBySlug: vi.fn(),
  sendLevelPromotionEmail: vi.fn(),
  getUserEmail: vi.fn(),
}));

vi.mock('#/db/user-levels', () => ({
  getCurrentLevel: m.getCurrentLevel,
  insertEarnedLevelRow: m.insertEarnedLevelRow,
}));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: m.getCourseDetailsWithCache,
  getCourseIdentityBySlug: m.getCourseIdentityBySlug,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: m.getCourseProgress,
}));
vi.mock('#/lib/email/send-level-promotion-email', () => ({
  sendLevelPromotionEmail: m.sendLevelPromotionEmail,
}));
vi.mock('#/db/user-profile', () => ({ getUserEmail: m.getUserEmail }));

import { maybePromote } from '#/lib/promotion.server';

const DETAILS = {
  modules: [
    {
      lessons: [
        { id: 1, isAvailable: true, levels: ['basic'] },
        { id: 2, isAvailable: true, levels: ['intermediate'] },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseIdentityBySlug.mockResolvedValue({ id: 7, name: 'RT Course' });
  m.getCourseDetailsWithCache.mockResolvedValue(DETAILS);
  m.getUserEmail.mockResolvedValue('pilot@example.com');
  m.sendLevelPromotionEmail.mockResolvedValue(undefined);
  // The inserted row's id — maybePromote returns it so the caller can
  // acknowledge exactly this row later (see PromotionInterstitial's dismiss).
  // Null would mean the conditional insert found a row already there.
  m.insertEarnedLevelRow.mockResolvedValue(42);
});

describe('maybePromote', () => {
  it('writes the next rung when the tier is finished', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 100 }],
    });

    const result = await maybePromote({ userId: 'u1', courseSlug: 'rt' });

    expect(result).toEqual({ id: 42, from: 'basic', to: 'intermediate' });
    expect(m.insertEarnedLevelRow).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      level: 'intermediate',
    });
  });

  it('writes nothing when the tier is unfinished', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 50 }],
    });

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toBeNull();
    expect(m.insertEarnedLevelRow).not.toHaveBeenCalled();
  });

  it('short-circuits at the top rung without querying progress', async () => {
    m.getCurrentLevel.mockResolvedValue('advanced');

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toBeNull();
    expect(m.getCourseProgress).not.toHaveBeenCalled();
    expect(m.insertEarnedLevelRow).not.toHaveBeenCalled();
  });

  it('emails the pilot on promotion', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 100 }],
    });

    await maybePromote({ userId: 'u1', courseSlug: 'rt' });

    expect(m.sendLevelPromotionEmail).toHaveBeenCalledWith({
      email: 'pilot@example.com',
      courseName: 'RT Course',
      level: 'intermediate',
    });
  });

  it('still reports the promotion when the email fails', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 100 }],
    });
    m.sendLevelPromotionEmail.mockRejectedValue(new Error('resend down'));

    const result = await maybePromote({ userId: 'u1', courseSlug: 'rt' });

    expect(result).toEqual({ id: 42, from: 'basic', to: 'intermediate' });
    expect(m.insertEarnedLevelRow).toHaveBeenCalled();
  });

  /**
   * The deploy-day cascade. Every lesson ships `levels = '{}'`, and
   * `isLessonVisibleAtLevel([], level)` is true for EVERY tier — so without a
   * guard, any pilot already at 100% is promoted to intermediate on their next
   * progress write and to advanced on the write after, each with a real email
   * and an append-only row. Asserting on the WRITER and the MAILER, not just
   * the return value: a promotion that wrote the row and then reported null
   * would still have shipped the incident.
   */
  it('promotes nobody in a course where no lesson is tagged', async () => {
    m.getCourseDetailsWithCache.mockResolvedValue({
      modules: [
        {
          lessons: [
            { id: 1, isAvailable: true, levels: [] },
            { id: 2, isAvailable: true, levels: [] },
          ],
        },
      ],
    });
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [
        { lessonId: 1, percent: 100 },
        { lessonId: 2, percent: 100 },
      ],
    });

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toBeNull();
    expect(m.insertEarnedLevelRow).not.toHaveBeenCalled();
    expect(m.sendLevelPromotionEmail).not.toHaveBeenCalled();
  });

  it('promotes nobody at the SECOND rung of an untagged course either', async () => {
    // The second half of the cascade: the write after the first promotion
    // would find `isTierComplete('intermediate')` true for exactly the same
    // reason and send a second email.
    m.getCourseDetailsWithCache.mockResolvedValue({
      modules: [{ lessons: [{ id: 1, isAvailable: true, levels: [] }] }],
    });
    m.getCurrentLevel.mockResolvedValue('intermediate');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 100 }],
    });

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toBeNull();
    expect(m.insertEarnedLevelRow).not.toHaveBeenCalled();
    expect(m.sendLevelPromotionEmail).not.toHaveBeenCalled();
  });

  it('still promotes when only SOME lessons are tagged', async () => {
    // The guard is "nothing in this course is tagged", not "every lesson is
    // tagged" — a part-tagged course is the normal mid-rollout state.
    m.getCourseDetailsWithCache.mockResolvedValue({
      modules: [
        {
          lessons: [
            { id: 1, isAvailable: true, levels: [] },
            { id: 2, isAvailable: true, levels: ['intermediate'] },
          ],
        },
      ],
    });
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [
        { lessonId: 1, percent: 100 },
        { lessonId: 2, percent: 100 },
      ],
    });

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toEqual({
      id: 42,
      from: 'basic',
      to: 'intermediate',
    });
  });

  /**
   * The concurrent case. Two overlapping progress writes both read
   * `from = 'basic'` and both pass `isTierComplete`; the conditional insert
   * is what stops the second from appending a row. Its null must reach the
   * MAILER as "say nothing" — a second congratulatory email for a promotion
   * that already happened is the visible half of the bug.
   */
  it('sends no email and reports nothing when the insert was skipped', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 100 }],
    });
    m.insertEarnedLevelRow.mockResolvedValue(null);

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toBeNull();
    expect(m.sendLevelPromotionEmail).not.toHaveBeenCalled();
  });
});
