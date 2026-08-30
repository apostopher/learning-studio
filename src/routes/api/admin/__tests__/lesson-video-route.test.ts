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
    requireLessonContentPermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    getDisciplineIdForLessonId: vi.fn(),
    setLessonVideo: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireLessonContentPermission: m.requireLessonContentPermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/db/lesson-access', () => ({
  getDisciplineIdForLessonId: m.getDisciplineIdForLessonId,
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
  // This lesson's discipline — a sentinel so a branch that forwards the wrong
  // value fails a `toHaveBeenCalledWith` assertion rather than passing by
  // coincidence.
  m.getDisciplineIdForLessonId.mockResolvedValue({
    found: true,
    disciplineId: 7,
  });
  m.requireLessonContentPermission.mockResolvedValue(undefined);
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
  // Requirement 6: video PUT allow/refuse pair. Authority follows the
  // lesson's DISCIPLINE (or org admin, if it has none) — see
  // `requireLessonContentPermission`, unit-tested at the permission layer.
  it('resolves the discipline and forwards it with an update action', async () => {
    await putVideoHandler(req(), '10');
    expect(m.getDisciplineIdForLessonId).toHaveBeenCalledWith(10);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'update',
    );
  });

  /**
   * The enumeration oracle. This handler resolves the row BEFORE guarding, so
   * an unauthenticated caller could walk sequential integer ids and read the
   * id space off the status code — 404 absent, 403 present. The absent
   * branch is delegated to `absentResourceResponse`, which answers 404 only
   * to someone on the teaching side (unit-tested in
   * lib/__tests__/permissions-server.test.ts).
   */
  it('hands an absent lesson to absentResourceResponse and returns its answer', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValue({ found: false });
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
    m.getDisciplineIdForLessonId.mockResolvedValue({ found: false });
    const res = await putVideoHandler(req(), '999');
    expect(res.status).toBe(404);
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
    expect(m.setLessonVideo).not.toHaveBeenCalled();
  });

  it('400s an invalid lesson id without resolving a discipline', async () => {
    const res = await putVideoHandler(req(), 'abc');
    expect(res.status).toBe(400);
    expect(m.getDisciplineIdForLessonId).not.toHaveBeenCalled();
  });

  // Mutant: still calls the old course-scoped `content:update` guard instead
  // of `requireLessonContentPermission`. Refusing only the mocked guard
  // would then not stop the write — RED.
  it('403s a refused guard without writing', async () => {
    m.requireLessonContentPermission.mockRejectedValueOnce(
      new m.ForbiddenError(),
    );
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

  // Requirement 4 (route half): a null-discipline ("Untitled") lesson
  // forwards `null` through untouched — the admin-admits/SME-refuses split
  // itself is pinned at the permission layer.
  it('forwards a null discipline ("Untitled") through untouched', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValue({
      found: true,
      disciplineId: null,
    });
    await putVideoHandler(req(), '10');
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      null,
      'update',
    );
  });
});
