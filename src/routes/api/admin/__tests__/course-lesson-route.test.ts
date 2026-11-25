// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {}
  return {
    ForbiddenError,
    requireCoursePermission: vi.fn(),
    setLessonVisibility: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/lesson-visibility', () => ({
  setLessonVisibility: m.setLessonVisibility,
}));

import { patchCourseLessonHandler } from '../courses.$courseId.lessons.$lessonId';

const patch = (body: unknown, courseId = '3', lessonId = '9') =>
  patchCourseLessonHandler(
    new Request('http://t/x', {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    courseId,
    lessonId,
  );

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.setLessonVisibility.mockResolvedValue(true);
});

describe('PATCH /api/admin/courses/:courseId/lessons/:lessonId', () => {
  it('sets it for that course, by that course’s structure permission', async () => {
    const res = await patch({ isVisible: false });
    expect(res.status).toBe(200);
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      3,
      'structure',
      'update',
    );
    expect(m.setLessonVisibility).toHaveBeenCalledWith({
      courseId: 3,
      lessonId: 9,
      isVisible: false,
    });
  });

  it('403s when refused, before reading the body', async () => {
    m.requireCoursePermission.mockRejectedValue(new m.ForbiddenError());
    expect((await patch('not json')).status).toBe(403);
    expect(m.setLessonVisibility).not.toHaveBeenCalled();
  });

  it('does not pass another error off as a refusal', async () => {
    m.requireCoursePermission.mockRejectedValue(new Error('db down'));
    await expect(patch({ isVisible: true })).rejects.toThrow('db down');
  });

  it.each([
    ['not json'],
    [{}],
    [{ isVisible: 'no' }],
    [{ isVisible: true, hasDebrief: true }],
  ])('400s %j', async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(m.setLessonVisibility).not.toHaveBeenCalled();
  });

  it.each([
    ['x', '9'],
    ['3', '0'],
  ])('400s the ids %s/%s', async (courseId, lessonId) => {
    expect((await patch({ isVisible: true }, courseId, lessonId)).status).toBe(
      400,
    );
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('404s a lesson not in the course’s own modules', async () => {
    m.setLessonVisibility.mockResolvedValue(false);
    expect((await patch({ isVisible: true })).status).toBe(404);
  });
});
