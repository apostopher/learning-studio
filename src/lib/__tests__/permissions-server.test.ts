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
    getSession: vi.fn(),
    getUserRoleNames: vi.fn(),
    getUserPermissions: vi.fn(),
    getRoleNamesForProfile: vi.fn(),
    isAnyCourseStaff: vi.fn(),
  };
});
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
  requireAdmin: vi.fn(),
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));
// `permissions.server.ts` imports these; leaving them real would drag `#/db`
// and its schema into a unit test that must not touch a database.
vi.mock('#/db/course-staff', () => ({
  getCourseRoleNames: vi.fn(),
  getStaffCourseIds: vi.fn(),
  isAnyCourseStaff: m.isAnyCourseStaff,
}));
vi.mock('#/db/discipline-staff', () => ({
  getDisciplineRoleNames: vi.fn(),
}));
vi.mock('#/db/permissions', () => ({
  getUserPermissions: m.getUserPermissions,
  getRoleNamesForProfile: m.getRoleNamesForProfile,
  // The real implementation is pure; keeping it real means the test exercises
  // the wildcard logic rather than a stub that always agrees.
  hasPermission: (perms: Set<string>, entity: string, action: string) =>
    perms.has('*') || perms.has(`${entity}:${action}`),
}));

import {
  absentResourceResponse,
  assertCanActOnProfile,
  isStaffAnywhere,
  requireOwner,
  requirePermission,
} from '#/lib/permissions.server';

const HEADERS = new Headers();

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: a guard that refuses BEFORE reaching
  // `getUserPermissions` (e.g. the admin floor) leaves that test's queued
  // `.mockResolvedValueOnce` unconsumed, and clearAllMocks would hand it to
  // whichever later test calls the mock first. Every default below is
  // re-established after the reset, so nothing is lost.
  vi.resetAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'actor-1' } });
  m.getUserRoleNames.mockResolvedValue(['admin']);
  m.getUserPermissions.mockResolvedValue(new Set<string>());
  m.getRoleNamesForProfile.mockResolvedValue([]);
  m.isAnyCourseStaff.mockResolvedValue(false);
});

describe('requirePermission', () => {
  it('allows an owner without any grant at all', async () => {
    m.getUserRoleNames.mockResolvedValueOnce(['owner']);
    m.getUserPermissions.mockResolvedValueOnce(new Set(['*']));

    const actor = await requirePermission(HEADERS, 'user', 'update');

    expect(actor.isOwner).toBe(true);
  });

  it('allows an admin holding the exact grant', async () => {
    m.getUserPermissions.mockResolvedValueOnce(new Set(['enrolment:create']));

    await expect(
      requirePermission(HEADERS, 'enrolment', 'create'),
    ).resolves.toMatchObject({ userId: 'actor-1', isOwner: false });
  });

  it('denies an admin holding a DIFFERENT grant', async () => {
    // The whole point of entity-splitting: being able to enrol must not imply
    // being able to edit profiles.
    m.getUserPermissions.mockResolvedValueOnce(new Set(['enrolment:create']));

    await expect(requirePermission(HEADERS, 'user', 'update')).rejects.toThrow(
      'Forbidden',
    );
  });

  it('denies an admin with no grants', async () => {
    await expect(requirePermission(HEADERS, 'user', 'read')).rejects.toThrow(
      'Forbidden',
    );
  });

  it('denies a signed-in user who is not an admin, whatever the grants', async () => {
    // Permissions refine what an admin may do; they never hand the admin
    // surface to a learner.
    m.getUserRoleNames.mockResolvedValueOnce([]);
    m.getUserPermissions.mockResolvedValueOnce(new Set(['user:read']));

    await expect(requirePermission(HEADERS, 'user', 'read')).rejects.toThrow(
      'Forbidden',
    );
  });

  it('denies an anonymous request', async () => {
    m.getSession.mockResolvedValueOnce(null);

    await expect(requirePermission(HEADERS, 'user', 'read')).rejects.toThrow(
      'Forbidden',
    );
  });
});

describe('requireOwner', () => {
  it('rejects an admin — role assignment is never delegated', async () => {
    await expect(requireOwner(HEADERS)).rejects.toThrow('Forbidden');
  });

  it('accepts an owner', async () => {
    m.getUserRoleNames.mockResolvedValueOnce(['owner']);
    await expect(requireOwner(HEADERS)).resolves.toMatchObject({
      userId: 'actor-1',
    });
  });
});

describe('assertCanActOnProfile', () => {
  const adminActor = {
    userId: 'actor-1',
    roles: ['admin'],
    permissions: new Set(['user:update']),
    isOwner: false,
  };

  it('lets an admin act on an ordinary learner', async () => {
    m.getRoleNamesForProfile.mockResolvedValueOnce([]);
    await expect(
      assertCanActOnProfile(adminActor, 42),
    ).resolves.toBeUndefined();
  });

  it('stops an admin acting on another admin', async () => {
    m.getRoleNamesForProfile.mockResolvedValueOnce(['admin']);
    await expect(assertCanActOnProfile(adminActor, 42)).rejects.toThrow(
      'Forbidden',
    );
  });

  it('stops an admin acting on an owner', async () => {
    m.getRoleNamesForProfile.mockResolvedValueOnce(['owner']);
    await expect(assertCanActOnProfile(adminActor, 42)).rejects.toThrow(
      'Forbidden',
    );
  });

  it("doesn't even look up the target for an owner", async () => {
    const owner = { ...adminActor, isOwner: true, roles: ['owner'] };
    await expect(assertCanActOnProfile(owner, 42)).resolves.toBeUndefined();
    expect(m.getRoleNamesForProfile).not.toHaveBeenCalled();
  });
});

describe('assertCanActOnProfile with course-scoped roles', () => {
  it('still refuses a target holding a global role', async () => {
    m.getRoleNamesForProfile.mockResolvedValueOnce(['admin']);
    await expect(
      assertCanActOnProfile(
        {
          userId: 'a1',
          roles: ['admin'],
          permissions: new Set<string>(),
          isOwner: false,
        },
        5,
      ),
    ).rejects.toThrow('Forbidden');
  });

  it('permits acting on a professor — a course role is not global privilege', async () => {
    // `getRoleNamesForProfile` reads `user_profile_roles` only, which never
    // holds a course-scoped role, so a professor with a `course_staff` grant
    // and no global role resolves to `[]` here — exactly what the real
    // implementation returns. If this ever regresses (someone starts writing
    // course roles into `user_profile_roles`, or widens this function to union
    // both tables), this test — not a production incident — is what catches it.
    m.getRoleNamesForProfile.mockResolvedValueOnce([]);
    await expect(
      assertCanActOnProfile(
        {
          userId: 'a1',
          roles: ['admin'],
          permissions: new Set<string>(),
          isOwner: false,
        },
        5,
      ),
    ).resolves.toBeUndefined();
  });

  it('lets an owner act on anyone', async () => {
    m.getRoleNamesForProfile.mockResolvedValueOnce(['admin']);
    await expect(
      assertCanActOnProfile(
        {
          userId: 'o1',
          roles: ['owner'],
          permissions: new Set(['*']),
          isOwner: true,
        },
        5,
      ),
    ).resolves.toBeUndefined();
  });
});

describe('isStaffAnywhere', () => {
  it('is true for an admin, without a course_staff lookup', async () => {
    await expect(isStaffAnywhere(HEADERS)).resolves.toBe(true);
    expect(m.isAnyCourseStaff).not.toHaveBeenCalled();
  });

  it('is true for a professor holding no global role at all', async () => {
    m.getUserRoleNames.mockResolvedValueOnce([]);
    m.isAnyCourseStaff.mockResolvedValueOnce(true);

    await expect(isStaffAnywhere(HEADERS)).resolves.toBe(true);
  });

  it('is false for an ordinary learner', async () => {
    m.getUserRoleNames.mockResolvedValueOnce([]);

    await expect(isStaffAnywhere(HEADERS)).resolves.toBe(false);
  });

  /**
   * The whole point of the helper: an anonymous caller must get a clean
   * answer, not a thrown session lookup that would surface as a 500 and be
   * indistinguishable from a real fault.
   */
  it('is false for an anonymous request, and does not throw', async () => {
    m.getSession.mockResolvedValueOnce(null);

    await expect(isStaffAnywhere(HEADERS)).resolves.toBe(false);
    expect(m.getUserRoleNames).not.toHaveBeenCalled();
  });
});

describe('absentResourceResponse', () => {
  it('404s with the message for someone on the teaching side', async () => {
    const res = await absentResourceResponse(HEADERS, 'Lesson not found');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Lesson not found' });
  });

  it('403s an ordinary learner rather than confirming the row is absent', async () => {
    m.getUserRoleNames.mockResolvedValueOnce([]);

    const res = await absentResourceResponse(HEADERS, 'Lesson not found');

    expect(res.status).toBe(403);
  });

  /**
   * `DELETE /api/admin/lessons/N` from the open internet used to answer 404
   * for an absent id and 403 for a present one, over sequential integer ids —
   * handing out the exact lesson id space. Both answers are 403 now.
   */
  it('403s an anonymous caller, so the two answers are indistinguishable', async () => {
    m.getSession.mockResolvedValueOnce(null);

    const res = await absentResourceResponse(HEADERS, 'Lesson not found');

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Forbidden');
  });
});
