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
    absentResourceResponse: vi.fn(),
    getCourseIdForModuleId: vi.fn(),
    createLesson: vi.fn(),
    linkLesson: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: m.getCourseIdForModuleId,
}));
vi.mock('#/db/admin', () => ({ createLesson: m.createLesson }));
vi.mock('#/db/placements', () => ({ linkLesson: m.linkLesson }));

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
  // Stands in for the real helper (unit-tested in
  // lib/__tests__/permissions-server.test.ts): it answers 404 to someone on
  // the teaching side and a flat 403 to everyone else, so a missing row
  // cannot be used to enumerate ids.
  m.absentResourceResponse.mockResolvedValue(
    new Response(null, { status: 404 }),
  );
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

  /**
   * The enumeration oracle. This handler resolves the row BEFORE guarding, so
   * an unauthenticated caller could walk sequential integer ids and read the
   * id space off the status code — 404 absent, 403 present. The absent branch
   * is delegated to `absentResourceResponse`, which answers 404 only to
   * someone on the teaching side (unit-tested in
   * lib/__tests__/permissions-server.test.ts).
   */
  it('hands an absent module to absentResourceResponse and returns its answer', async () => {
    m.getCourseIdForModuleId.mockResolvedValue(null);
    m.absentResourceResponse.mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );
    const request = req();

    const res = await postLessonHandler(request, '999');

    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Module not found',
    );
    expect(res.status).toBe(403);
    expect(m.createLesson).not.toHaveBeenCalled();
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

  // Mutant this kills: dropping the `if ('lessonId' in parsed.data)` branch
  // and always calling `createLesson` — every `{ name }` test above would
  // still pass, but a `{ name }` request would ALSO call `linkLesson`.
  it('does not link when creating from a name', async () => {
    await postLessonHandler(req({ name: 'Preflight checks' }), '5');
    expect(m.linkLesson).not.toHaveBeenCalled();
  });
});
