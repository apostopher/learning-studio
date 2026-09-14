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
    remixCourse: vi.fn(),
    unremixCourse: vi.fn(),
    getActiveOrgId: vi.fn(() => 1),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/lib/active-org.server', () => ({
  getActiveOrgId: m.getActiveOrgId,
}));
vi.mock('#/db/course-remixes', () => ({
  remixCourse: m.remixCourse,
  unremixCourse: m.unremixCourse,
}));

import { postRemixHandler } from '../courses.$courseId.remixes';
import { deleteRemixHandler } from '../courses.$courseId.remixes.$sourceCourseId';

function post(body: unknown): Request {
  return new Request('http://t/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.remixCourse.mockResolvedValue({ ok: true, moduleCount: 7 });
  m.unremixCourse.mockResolvedValue({ ok: true, moduleCount: 7 });
});

describe('POST /api/admin/courses/:courseId/remixes', () => {
  /**
   * Spec test group 2. The bug shape is `requireCoursePermission(B)` where
   * it should be `(A)` — or only one of the two — so the assertion is on the
   * exact (courseId, entity, action) pairs, in order, not on a throw.
   */
  it('asks for structure:update on the REMIXER and structure:read on the SOURCE', async () => {
    await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(m.requireCoursePermission.mock.calls.map((c) => c.slice(1))).toEqual(
      [
        [2, 'structure', 'update'],
        [6, 'structure', 'read'],
      ],
    );
  });

  it('403s when the remixer guard refuses, without checking the source or writing', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(res.status).toBe(403);
    expect(m.requireCoursePermission).toHaveBeenCalledTimes(1);
    expect(m.remixCourse).not.toHaveBeenCalled();
  });

  it('403s when the source guard refuses, without writing', async () => {
    m.requireCoursePermission
      .mockResolvedValueOnce({ userId: 'u1' })
      .mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(res.status).toBe(403);
    expect(m.remixCourse).not.toHaveBeenCalled();
  });

  it('400s a course remixing itself before guarding', async () => {
    const res = await postRemixHandler(post({ sourceCourseId: 2 }), '2');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('hands the writer the org, both ids and the actor', async () => {
    await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(m.remixCourse).toHaveBeenCalledWith({
      orgId: 1,
      courseId: 2,
      sourceCourseId: 6,
      actorId: 'u1',
    });
  });

  it('201s with the module count', async () => {
    const res = await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ moduleCount: 7 });
  });

  it('409s an already-remixed pair and 404s an unknown course', async () => {
    m.remixCourse.mockResolvedValueOnce({
      ok: false,
      reason: 'already-remixed',
    });
    expect(
      (await postRemixHandler(post({ sourceCourseId: 6 }), '2')).status,
    ).toBe(409);
    m.remixCourse.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    expect(
      (await postRemixHandler(post({ sourceCourseId: 6 }), '2')).status,
    ).toBe(404);
  });

  it('400s an unparseable course id before guarding or reading the body', async () => {
    const res = await postRemixHandler(post({ sourceCourseId: 6 }), 'nonsense');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.remixCourse).not.toHaveBeenCalled();
  });

  it('400s a non-integer sourceCourseId before guarding', async () => {
    const stringified = await postRemixHandler(
      post({ sourceCourseId: '6' }),
      '2',
    );
    expect(stringified.status).toBe(400);
    const fractional = await postRemixHandler(
      post({ sourceCourseId: 1.5 }),
      '2',
    );
    expect(fractional.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/courses/:courseId/remixes/:sourceCourseId', () => {
  it('asks for structure:update on the REMIXER only — removing a borrowed rail needs no rights on the source', async () => {
    await deleteRemixHandler(
      new Request('http://t/x', { method: 'DELETE' }),
      '2',
      '6',
    );
    expect(m.requireCoursePermission.mock.calls.map((c) => c.slice(1))).toEqual(
      [[2, 'structure', 'update']],
    );
  });

  it('hands the writer the org and both ids, and 200s with the count', async () => {
    const res = await deleteRemixHandler(
      new Request('http://t/x', { method: 'DELETE' }),
      '2',
      '6',
    );
    expect(m.unremixCourse).toHaveBeenCalledWith({
      orgId: 1,
      courseId: 2,
      sourceCourseId: 6,
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ moduleCount: 7 });
  });

  it('404s when no such remix exists', async () => {
    m.unremixCourse.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    const res = await deleteRemixHandler(
      new Request('http://t/x', { method: 'DELETE' }),
      '2',
      '6',
    );
    expect(res.status).toBe(404);
  });

  it('400s an unparseable remixer or source id before guarding', async () => {
    const badCourse = await deleteRemixHandler(
      new Request('http://t/x', { method: 'DELETE' }),
      'nonsense',
      '6',
    );
    expect(badCourse.status).toBe(400);
    await expect(badCourse.json()).resolves.toEqual({
      error: 'Invalid course id',
    });

    const badSource = await deleteRemixHandler(
      new Request('http://t/x', { method: 'DELETE' }),
      '2',
      '0',
    );
    expect(badSource.status).toBe(400);
    await expect(badSource.json()).resolves.toEqual({
      error: 'Invalid source course id',
    });

    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.unremixCourse).not.toHaveBeenCalled();
  });
});
