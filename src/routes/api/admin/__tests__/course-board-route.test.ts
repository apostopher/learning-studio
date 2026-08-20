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
    getCourseBoard: vi.fn(),
  };
});

vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/admin', () => ({ getCourseBoard: m.getCourseBoard }));

import { getCourseBoardHandler } from '../courses.$courseId.board';

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.getCourseBoard.mockResolvedValue({ modules: [] });
});

function req(): Request {
  return new Request('http://t/x', { method: 'GET' });
}

describe('GET /api/admin/courses/:courseId/board', () => {
  it('asks for structure:read on that specific course', async () => {
    await getCourseBoardHandler(req(), '7');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'structure',
      'read',
    );
  });

  it('403s when refused, without reading the board', async () => {
    m.requireCoursePermission.mockRejectedValue(new m.ForbiddenError());
    const res = await getCourseBoardHandler(req(), '7');
    expect(res.status).toBe(403);
    expect(m.getCourseBoard).not.toHaveBeenCalled();
  });

  it('400s an unparseable course id before guarding', async () => {
    const res = await getCourseBoardHandler(req(), 'nonsense');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });
});
