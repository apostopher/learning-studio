// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requireCoursePermission: vi.fn(),
    getCourseLessonPosters: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/admin', () => ({
  getCourseLessonPosters: m.getCourseLessonPosters,
}));

import { getCourseLessonPostersHandler } from '../courses.$courseId.lesson-posters';

function req(): Request {
  return new Request('http://t/x', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.getCourseLessonPosters.mockResolvedValue({});
});

describe('GET /api/admin/courses/:courseId/lesson-posters', () => {
  it('asks for structure:read on that specific course', async () => {
    await getCourseLessonPostersHandler(req(), '9');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      9,
      'structure',
      'read',
    );
  });

  it('403s when refused, without reading posters', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await getCourseLessonPostersHandler(req(), '9');
    expect(res.status).toBe(403);
    expect(m.getCourseLessonPosters).not.toHaveBeenCalled();
  });

  it('400s an unparseable course id before guarding', async () => {
    const res = await getCourseLessonPostersHandler(req(), 'nonsense');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });
});
