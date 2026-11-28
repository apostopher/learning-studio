// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  getLessonInCourse: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getUserRoleNames: vi.fn(),
  getCurrentLevel: vi.fn(),
  isCourseStaff: vi.fn(),
  seatPlanForCourse: vi.fn(),
}));

vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: m.getCourseDetailsWithCache,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: m.getCourseProgress,
}));
vi.mock('#/db/course-staff', () => ({ isCourseStaff: m.isCourseStaff }));
vi.mock('#/db/lesson-access', () => ({
  getLessonInCourse: m.getLessonInCourse,
  isSubscribedToCourse: m.isSubscribedToCourse,
}));
vi.mock('#/db/admin', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/user-levels', () => ({ getCurrentLevel: m.getCurrentLevel }));
vi.mock('#/db/course-roster-access', () => ({
  seatPlanForCourse: m.seatPlanForCourse,
  isOnCourseRoster: async () => true,
  isOnCourseRosterBySlug: async () => true,
}));

import { evaluateLessonGate } from '#/lib/lesson-gating.server';

const lesson = (slug: string, id: number, requiredSubscriptions: string[]) => ({
  id,
  slug,
  name: slug,
  isAvailable: true,
  hasVideo: true,
  needsVideoWatch: true,
  levels: [],
  levelGated: false,
  requiredSubscriptions,
  dependsOn: [],
});

const details = {
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'Module One',
      dependsOn: [],
      lessons: [
        lesson('paid', 10, ['associate', 'candidate', 'rpoc']),
        lesson('free', 11, []),
      ],
    },
  ],
};

const gate = (lessonSlug: string) =>
  evaluateLessonGate({ userId: 'u1', lessonSlug, courseSlug: 'c1' });

beforeEach(() => {
  vi.clearAllMocks();
  m.getLessonInCourse.mockResolvedValue({ courseId: 7, isAvailable: true });
  m.getCourseDetailsWithCache.mockResolvedValue(details);
  // Nothing watched: a "watch first" lock would apply to every lesson.
  m.getCourseProgress.mockResolvedValue({ lessons: [] });
  m.isSubscribedToCourse.mockResolvedValue(true);
  m.getUserRoleNames.mockResolvedValue([]);
  m.getCurrentLevel.mockResolvedValue('basic');
  m.isCourseStaff.mockResolvedValue(false);
  m.seatPlanForCourse.mockResolvedValue('free');
});

describe('a free seat on a paid lesson', () => {
  it('caps the video at 15 seconds, asking about this user on this course', async () => {
    const result = await gate('paid');
    expect(result?.videoPreviewSeconds).toBe(15);
    expect(m.seatPlanForCourse).toHaveBeenCalledWith('u1', 7);
  });

  it('holds the material back for the paid plan, not until a watch', async () => {
    const result = await gate('paid');
    expect(result?.materialLock).toEqual({ kind: 'plan-locked' });
    // The lesson itself still opens: its 15-second preview plays.
    expect(result?.lessonLock).toEqual({ kind: 'open' });
  });

  it('holds it back even once the video was watched (on an earlier paid seat)', async () => {
    m.getCourseProgress.mockResolvedValue({
      lessons: [
        {
          lessonId: 10,
          moduleId: 1,
          percent: 100,
          watched: true,
          done: true,
          outstanding: [],
        },
      ],
    });
    const result = await gate('paid');
    expect(result?.materialLock).toEqual({ kind: 'plan-locked' });
  });
});

describe('no cap', () => {
  it('on a free lesson, even on a free seat', async () => {
    const result = await gate('free');
    expect(result?.videoPreviewSeconds).toBeNull();
    // And the ordinary watch-first lock still holds.
    expect(result?.materialLock).toEqual({ kind: 'video-locked' });
  });

  it('on a paid seat', async () => {
    m.seatPlanForCourse.mockResolvedValue('paid');
    const result = await gate('paid');
    expect(result?.videoPreviewSeconds).toBeNull();
    expect(result?.materialLock).toEqual({ kind: 'video-locked' });
  });

  it('for the course’s author', async () => {
    m.isCourseStaff.mockResolvedValue(true);
    const result = await gate('paid');
    expect(result?.isAdmin).toBe(true);
    expect(result?.videoPreviewSeconds).toBeNull();
  });
});
