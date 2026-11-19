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
    updateCoursePassMark: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requirePermission: m.requirePermission,
}));
vi.mock('#/db/course', () => ({
  updateCoursePassMark: m.updateCoursePassMark,
}));

import { putPassMarkHandler } from '../courses.$courseId.pass-mark';

function putReq(body: unknown): Request {
  return new Request('http://t/x', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePermission.mockResolvedValue({ userId: 'u1' });
  m.updateCoursePassMark.mockResolvedValue(true);
});

describe('putPassMarkHandler', () => {
  it('writes the mark for the course and echoes it', async () => {
    const res = await putPassMarkHandler(putReq({ passMark: 90 }), '7');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ passMark: 90 });
    expect(m.updateCoursePassMark).toHaveBeenCalledWith(7, 90);
  });

  it('asks for course:update', async () => {
    await putPassMarkHandler(putReq({ passMark: 90 }), '7');
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'course',
      'update',
    );
  });

  it('400s an out-of-range mark without writing', async () => {
    const res = await putPassMarkHandler(putReq({ passMark: 101 }), '7');
    expect(res.status).toBe(400);
    expect(m.updateCoursePassMark).not.toHaveBeenCalled();
  });

  it('400s a bad course id without writing', async () => {
    const res = await putPassMarkHandler(putReq({ passMark: 90 }), 'x');
    expect(res.status).toBe(400);
    expect(m.updateCoursePassMark).not.toHaveBeenCalled();
  });

  it('403s when refused, without writing', async () => {
    m.requirePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await putPassMarkHandler(putReq({ passMark: 90 }), '7');
    expect(res.status).toBe(403);
    expect(m.updateCoursePassMark).not.toHaveBeenCalled();
  });

  it('404s when no course row was updated', async () => {
    m.updateCoursePassMark.mockResolvedValueOnce(false);
    const res = await putPassMarkHandler(putReq({ passMark: 90 }), '7');
    expect(res.status).toBe(404);
  });
});
