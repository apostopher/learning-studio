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
    getCourseIdForLessonId: vi.fn(),
    setLessonVideo: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForLessonId: m.getCourseIdForLessonId,
}));
vi.mock('#/db/admin', () => ({ setLessonVideo: m.setLessonVideo }));

import { putVideoHandler } from '../lessons.$lessonId.video';

function req(body: unknown = { provider: 'mux', ref: 'abc123' }): Request {
  return new Request('http://test/api/admin/lessons/10/video', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseIdForLessonId.mockResolvedValue(42);
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.setLessonVideo.mockResolvedValue(true);
});

describe('PUT /api/admin/lessons/:lessonId/video', () => {
  it('asks for content:update scoped to the lesson’s course', async () => {
    await putVideoHandler(req(), '10');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'content',
      'update',
    );
  });

  it('404s a lesson that does not exist, before guarding', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    const res = await putVideoHandler(req(), '999');
    expect(res.status).toBe(404);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.setLessonVideo).not.toHaveBeenCalled();
  });

  it('400s an invalid lesson id without resolving a course', async () => {
    const res = await putVideoHandler(req(), 'abc');
    expect(res.status).toBe(400);
    expect(m.getCourseIdForLessonId).not.toHaveBeenCalled();
  });

  it('403s a refused course manager (read-only on content) without writing', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await putVideoHandler(req(), '10');
    expect(res.status).toBe(403);
    expect(m.setLessonVideo).not.toHaveBeenCalled();
  });

  it('400s an invalid video input', async () => {
    const res = await putVideoHandler(req({ provider: 'nope' }), '10');
    expect(res.status).toBe(400);
    expect(m.setLessonVideo).not.toHaveBeenCalled();
  });

  it('sets the video once permitted', async () => {
    const res = await putVideoHandler(req(), '10');
    expect(res.status).toBe(200);
    expect(m.setLessonVideo).toHaveBeenCalledWith(10, 'mux', 'abc123');
  });

  it('404s when the lesson vanishes between the guard and the write', async () => {
    m.setLessonVideo.mockResolvedValue(false);
    const res = await putVideoHandler(req(), '10');
    expect(res.status).toBe(404);
  });
});
