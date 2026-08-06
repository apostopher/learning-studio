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
  };
});
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/permissions', () => ({
  getUserPermissions: m.getUserPermissions,
  getRoleNamesForProfile: m.getRoleNamesForProfile,
  // The real implementation is pure; keeping it real means the test exercises
  // the wildcard logic rather than a stub that always agrees.
  hasPermission: (perms: Set<string>, entity: string, action: string) =>
    perms.has('*') || perms.has(`${entity}:${action}`),
}));

import {
  assertCanActOnProfile,
  requireOwner,
  requirePermission,
} from '#/lib/permissions.server';

const HEADERS = new Headers();

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'actor-1' } });
  m.getUserRoleNames.mockResolvedValue(['admin']);
  m.getUserPermissions.mockResolvedValue(new Set<string>());
  m.getRoleNamesForProfile.mockResolvedValue([]);
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
