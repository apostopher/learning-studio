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
    getCourseIdForModuleId: vi.fn(),
    createLesson: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: m.getCourseIdForModuleId,
}));
vi.mock('#/db/admin', () => ({ createLesson: m.createLesson }));

import { postLessonHandler } from '../modules.$moduleId.lessons';

function req(body: unknown = { name: 'Preflight checks' }): Request {
  return new Request('http://test/api/admin/modules/5/lessons', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseIdForModuleId.mockResolvedValue(42);
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.createLesson.mockResolvedValue({ id: 1, name: 'Preflight checks' });
});

describe('POST /api/admin/modules/:moduleId/lessons', () => {
  it('asks for structure:create scoped to the module’s course', async () => {
    await postLessonHandler(req(), '5');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'create',
    );
  });

  it('404s a module that does not exist, before guarding', async () => {
    m.getCourseIdForModuleId.mockResolvedValue(null);
    const res = await postLessonHandler(req(), '999');
    expect(res.status).toBe(404);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.createLesson).not.toHaveBeenCalled();
  });

  it('400s an invalid module id without resolving a course', async () => {
    const res = await postLessonHandler(req(), 'abc');
    expect(res.status).toBe(400);
    expect(m.getCourseIdForModuleId).not.toHaveBeenCalled();
  });

  it('403s a refused course manager without creating a lesson', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postLessonHandler(req(), '5');
    expect(res.status).toBe(403);
    expect(m.createLesson).not.toHaveBeenCalled();
  });

  it('400s a schema failure before creating', async () => {
    const res = await postLessonHandler(req({ name: '' }), '5');
    expect(res.status).toBe(400);
    expect(m.createLesson).not.toHaveBeenCalled();
  });

  it('creates the lesson scoped to the module', async () => {
    await postLessonHandler(req({ name: 'Preflight checks' }), '5');
    expect(m.createLesson).toHaveBeenCalledWith({
      moduleId: 5,
      name: 'Preflight checks',
    });
  });
});
