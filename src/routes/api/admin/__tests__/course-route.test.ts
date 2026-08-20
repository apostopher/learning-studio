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
    requirePermission: vi.fn(),
    updateCourse: vi.fn(),
    deleteCourse: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requirePermission: m.requirePermission,
}));
vi.mock('#/db/admin', () => ({
  updateCourse: m.updateCourse,
  deleteCourse: m.deleteCourse,
}));

import { deleteCourseHandler, patchCourseHandler } from '../courses.$courseId';

const COURSE = { id: 1, name: 'PPL', slug: 'ppl' };

function patchReq(body: unknown = { name: 'PPL' }): Request {
  return new Request('http://t/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(): Request {
  return new Request('http://t/x', { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePermission.mockResolvedValue({ userId: 'u1' });
  m.updateCourse.mockResolvedValue(COURSE);
  m.deleteCourse.mockResolvedValue(true);
});

describe('patchCourseHandler', () => {
  it('asks for course:update — org-level, not per-course', async () => {
    await patchCourseHandler(patchReq(), '1');
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'course',
      'update',
    );
  });

  it('403s when refused, without updating the course', async () => {
    m.requirePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchCourseHandler(patchReq(), '1');
    expect(res.status).toBe(403);
    expect(m.updateCourse).not.toHaveBeenCalled();
  });

  it('400s an unparseable course id before guarding', async () => {
    const res = await patchCourseHandler(patchReq(), 'nonsense');
    expect(res.status).toBe(400);
    expect(m.requirePermission).not.toHaveBeenCalled();
  });

  it('404s a missing course', async () => {
    m.updateCourse.mockResolvedValue(null);
    const res = await patchCourseHandler(patchReq(), '1');
    expect(res.status).toBe(404);
  });
});

describe('deleteCourseHandler', () => {
  it('asks for course:delete — org-level, not per-course', async () => {
    await deleteCourseHandler(deleteReq(), '1');
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'course',
      'delete',
    );
  });

  it('403s when refused, without deleting the course', async () => {
    m.requirePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await deleteCourseHandler(deleteReq(), '1');
    expect(res.status).toBe(403);
    expect(m.deleteCourse).not.toHaveBeenCalled();
  });

  it('400s an unparseable course id before guarding', async () => {
    const res = await deleteCourseHandler(deleteReq(), 'nonsense');
    expect(res.status).toBe(400);
    expect(m.requirePermission).not.toHaveBeenCalled();
  });

  it('404s a missing course', async () => {
    m.deleteCourse.mockResolvedValue(false);
    const res = await deleteCourseHandler(deleteReq(), '1');
    expect(res.status).toBe(404);
  });
});
