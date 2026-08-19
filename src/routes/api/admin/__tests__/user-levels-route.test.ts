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
    assertCanActOnProfile: vi.fn(),
    getUserProfile: vi.fn(),
    listLevelHistory: vi.fn(),
    insertLevelRow: vi.fn(),
    courseExists: vi.fn(),
  };
});

vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requirePermission: m.requirePermission,
  assertCanActOnProfile: m.assertCanActOnProfile,
}));
vi.mock('#/db/users', () => ({ getUserProfile: m.getUserProfile }));
vi.mock('#/db/course', () => ({ courseExists: m.courseExists }));
vi.mock('#/db/user-levels', () => ({
  listLevelHistory: m.listLevelHistory,
  insertLevelRow: m.insertLevelRow,
}));

import {
  getUserLevelsHandler,
  putUserLevelHandler,
} from '../users.$profileId.levels';

const ACTOR = {
  userId: 'actor-1',
  roles: ['admin'],
  permissions: new Set<string>(),
  isOwner: false,
};

function req(body?: unknown, method = 'PUT'): Request {
  return new Request('http://t/x', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePermission.mockResolvedValue(ACTOR);
  m.assertCanActOnProfile.mockResolvedValue(undefined);
  m.getUserProfile.mockResolvedValue({
    profileId: 5,
    userId: 'user-5',
    email: 'p@e.com',
  });
  m.listLevelHistory.mockResolvedValue([]);
  m.courseExists.mockResolvedValue(true);
});

describe('PUT /api/admin/users/:id/levels', () => {
  it('asks for level:update specifically', async () => {
    await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: 'Ex-instructor.' }),
      '5',
    );
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'level',
      'update',
    );
  });

  it('records the acting admin and the pilot-facing message', async () => {
    await putUserLevelHandler(
      req({
        courseId: 3,
        level: 'advanced',
        message: 'Ex-instructor.',
        note: 'Ticket 4412',
      }),
      '5',
    );
    expect(m.insertLevelRow).toHaveBeenCalledWith({
      userId: 'user-5',
      courseId: 3,
      level: 'advanced',
      source: 'admin',
      message: 'Ex-instructor.',
      note: 'Ticket 4412',
      changedBy: 'actor-1',
    });
  });

  it('refuses a change with no message for the pilot', async () => {
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: '   ' }),
      '5',
    );
    expect(res.status).toBe(400);
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });

  it('accepts a demotion — it is the only correction path there is', async () => {
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'basic', message: 'Tagged in error, sorry.' }),
      '5',
    );
    expect(res.status).toBe(204);
    expect(m.insertLevelRow).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'basic' }),
    );
  });

  it('403s when denied', async () => {
    m.requirePermission.mockRejectedValue(new m.ForbiddenError());
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: 'x' }),
      '5',
    );
    expect(res.status).toBe(403);
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });

  it('refuses to act on a privileged target', async () => {
    m.assertCanActOnProfile.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: 'x' }),
      '5',
    );
    expect(res.status).toBe(403);
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });

  it('404s an unknown profile', async () => {
    m.getUserProfile.mockResolvedValue(null);
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: 'x' }),
      '5',
    );
    expect(res.status).toBe(404);
  });

  /**
   * Left to the database, a bad courseId raises `user_levels.course_id`'s
   * foreign key, the error escapes the handler, and the admin gets a 500 for
   * what is a validation failure. Asserting the WRITE never happens as well as
   * the status: the point is that the insert is not attempted at all.
   */
  it('404s an unknown course instead of letting the FK 500', async () => {
    m.courseExists.mockResolvedValue(false);
    const res = await putUserLevelHandler(
      req({ courseId: 9999, level: 'advanced', message: 'x' }),
      '5',
    );
    expect(res.status).toBe(404);
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/users/:id/levels', () => {
  it('asks for level:read', async () => {
    await getUserLevelsHandler(req(undefined, 'GET'), '5');
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'level',
      'read',
    );
  });

  /**
   * The PUT has always checked the target; the GET did not, so a `level:read`
   * holder could read an OWNER's history — which carries the admin-written
   * `message` and `note` of every change ever made to them.
   */
  it('refuses to read a privileged target’s history', async () => {
    m.assertCanActOnProfile.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await getUserLevelsHandler(req(undefined, 'GET'), '5');
    expect(res.status).toBe(403);
    expect(m.listLevelHistory).not.toHaveBeenCalled();
  });
});
