// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getCurrentLevel: vi.fn(),
  insertLevelRow: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  getCourseIdentityBySlug: vi.fn(),
  sendLevelPromotionEmail: vi.fn(),
  getUserEmail: vi.fn(),
}));

vi.mock('#/db/user-levels', () => ({
  getCurrentLevel: m.getCurrentLevel,
  insertLevelRow: m.insertLevelRow,
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
  m.insertLevelRow.mockResolvedValue(42);
});

describe('maybePromote', () => {
  it('writes the next rung when the tier is finished', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 100 }],
    });

    const result = await maybePromote({ userId: 'u1', courseSlug: 'rt' });

    expect(result).toEqual({ id: 42, from: 'basic', to: 'intermediate' });
    expect(m.insertLevelRow).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      level: 'intermediate',
      source: 'earned',
    });
  });

  it('writes nothing when the tier is unfinished', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 50 }],
    });

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toBeNull();
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });

  it('short-circuits at the top rung without querying progress', async () => {
    m.getCurrentLevel.mockResolvedValue('advanced');

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toBeNull();
    expect(m.getCourseProgress).not.toHaveBeenCalled();
    expect(m.insertLevelRow).not.toHaveBeenCalled();
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
    expect(m.insertLevelRow).toHaveBeenCalled();
  });
});
