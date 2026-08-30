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
    requireAdmin: vi.fn(),
    absentResourceResponse: vi.fn(),
    getCourseIdForLessonId: vi.fn(),
    setLessonVideo: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
  requireAdmin: m.requireAdmin,
}));
vi.mock('#/lib/permissions.server', () => ({
  absentResourceResponse: m.absentResourceResponse,
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
  m.requireAdmin.mockResolvedValue({ userId: 'u1', roles: ['admin'] });
  // Stands in for the real helper (unit-tested in
  // lib/__tests__/permissions-server.test.ts): it answers 404 to someone on
  // the teaching side and a flat 403 to everyone else, so a missing row
  // cannot be used to enumerate ids.
  m.absentResourceResponse.mockResolvedValue(
    new Response(null, { status: 404 }),
  );
  m.setLessonVideo.mockResolvedValue(true);
});

describe('PUT /api/admin/lessons/:lessonId/video', () => {
  // Video is lesson content — org-owned, since a lesson can now be taught by
  // several courses — so it is gated by `requireAdmin`, not a course's
  // `content` permission.
  it('calls requireAdmin', async () => {
    await putVideoHandler(req(), '10');
    expect(m.requireAdmin).toHaveBeenCalledWith(expect.anything());
  });

  /**
   * The enumeration oracle. This handler resolves the row BEFORE guarding, so
   * an unauthenticated caller could walk sequential integer ids and read the
   * id space off the status code — 404 absent, 403 present. The absent branch
   * is delegated to `absentResourceResponse`, which answers 404 only to
   * someone on the teaching side (unit-tested in
   * lib/__tests__/permissions-server.test.ts).
   */
  it('hands an absent lesson to absentResourceResponse and returns its answer', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    m.absentResourceResponse.mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );
    const request = req();

    const res = await putVideoHandler(request, '999');

    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Lesson not found',
    );
    expect(res.status).toBe(403);
    expect(m.setLessonVideo).not.toHaveBeenCalled();
  });

  it('404s a lesson that does not exist, before guarding', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    const res = await putVideoHandler(req(), '999');
    expect(res.status).toBe(404);
    expect(m.requireAdmin).not.toHaveBeenCalled();
    expect(m.setLessonVideo).not.toHaveBeenCalled();
  });

  it('400s an invalid lesson id without resolving a course', async () => {
    const res = await putVideoHandler(req(), 'abc');
    expect(res.status).toBe(400);
    expect(m.getCourseIdForLessonId).not.toHaveBeenCalled();
  });

  // Mutant: still calls the old course-scoped `content:update` guard instead
  // of `requireAdmin`. Refusing only `requireAdmin` would then not stop the
  // write — RED.
  it('403s a refused admin without writing', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
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
