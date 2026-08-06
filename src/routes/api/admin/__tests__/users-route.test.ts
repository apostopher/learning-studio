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
    requireOwner: vi.fn(),
    assertCanActOnProfile: vi.fn(),
    listUsers: vi.fn(),
    getUserProfile: vi.fn(),
    updateUserProfile: vi.fn(),
    addUserEnrolment: vi.fn(),
    removeUserEnrolment: vi.fn(),
    listUnclaimedEnrolments: vi.fn(),
    addPendingEnrolment: vi.fn(),
    setUserRole: vi.fn(),
    setRolePermission: vi.fn(),
    listRoles: vi.fn(),
    listRolePermissions: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requirePermission: m.requirePermission,
  requireOwner: m.requireOwner,
  assertCanActOnProfile: m.assertCanActOnProfile,
}));
vi.mock('#/db/users', () => ({
  listUsers: m.listUsers,
  getUserProfile: m.getUserProfile,
  updateUserProfile: m.updateUserProfile,
  addUserEnrolment: m.addUserEnrolment,
  removeUserEnrolment: m.removeUserEnrolment,
}));
vi.mock('#/db/pending-enrolments', () => ({
  listUnclaimedEnrolments: m.listUnclaimedEnrolments,
  addPendingEnrolment: m.addPendingEnrolment,
}));
vi.mock('#/db/permissions', () => ({
  setUserRole: m.setUserRole,
  setRolePermission: m.setRolePermission,
  listRoles: m.listRoles,
  listRolePermissions: m.listRolePermissions,
}));

import {
  getRolePermissionsHandler,
  putRolePermissionHandler,
} from '../role-permissions';
import { getUsersHandler, postUserHandler } from '../users';
import { patchUserHandler } from '../users.$profileId';
import { putEnrolmentHandler } from '../users.$profileId.enrolments';
import { putUserRoleHandler } from '../users.$profileId.roles';

const ACTOR = {
  userId: 'actor-1',
  roles: ['admin'],
  permissions: new Set<string>(),
  isOwner: false,
};

function req(body?: unknown, method = 'POST'): Request {
  return new Request('http://t/x', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePermission.mockResolvedValue(ACTOR);
  m.requireOwner.mockResolvedValue({ userId: 'owner-1', roles: ['owner'] });
  m.assertCanActOnProfile.mockResolvedValue(undefined);
  m.listUsers.mockResolvedValue([]);
  m.listUnclaimedEnrolments.mockResolvedValue([]);
  m.getUserProfile.mockResolvedValue({
    profileId: 5,
    userId: 'user-5',
    email: 'p@e.com',
  });
});

describe('every handler self-guards', () => {
  const cases: [string, () => Promise<Response>][] = [
    ['GET /users', () => getUsersHandler(req(undefined, 'GET'))],
    [
      'POST /users',
      () => postUserHandler(req({ email: 'a@b.com', courseIds: [1] })),
    ],
    ['PATCH /users/:id', () => patchUserHandler(req({ firstName: 'A' }), '5')],
    [
      'PUT /users/:id/enrolments',
      () => putEnrolmentHandler(req({ courseId: 1, granted: true }), '5'),
    ],
    [
      'PUT /users/:id/roles',
      () => putUserRoleHandler(req({ role: 'admin', granted: true }), '5'),
    ],
    [
      'GET /role-permissions',
      () => getRolePermissionsHandler(req(undefined, 'GET')),
    ],
  ];

  // Persistent, not `...Once`: each handler calls only ONE of these guards, so
  // a queued single-use rejection on the other would survive into later tests.
  // `beforeEach` re-installs the resolving implementation.
  it.each(cases)('%s returns 403 when denied', async (_label, call) => {
    m.requirePermission.mockRejectedValue(new m.ForbiddenError());
    m.requireOwner.mockRejectedValue(new m.ForbiddenError());
    const res = await call();
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/users — pre-assignment', () => {
  it('records one pending row per course, crediting the actor', async () => {
    const res = await postUserHandler(
      req({ email: 'Pilot@Example.com', courseIds: [3, 4] }),
    );

    expect(res.status).toBe(201);
    expect(m.addPendingEnrolment).toHaveBeenCalledTimes(2);
    expect(m.addPendingEnrolment).toHaveBeenCalledWith({
      email: 'pilot@example.com',
      courseId: 3,
      addedBy: 'actor-1',
    });
  });

  it('requires user:create specifically', async () => {
    await postUserHandler(req({ email: 'a@b.com', courseIds: [1] }));
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'user',
      'create',
    );
  });

  it('rejects a bad email before writing anything', async () => {
    const res = await postUserHandler(req({ email: 'nope', courseIds: [1] }));
    expect(res.status).toBe(400);
    expect(m.addPendingEnrolment).not.toHaveBeenCalled();
  });
});

describe('PUT enrolments', () => {
  it('asks for enrolment:create when granting', async () => {
    await putEnrolmentHandler(req({ courseId: 3, granted: true }), '5');
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'enrolment',
      'create',
    );
    expect(m.addUserEnrolment).toHaveBeenCalledWith({
      userId: 'user-5',
      courseId: 3,
      grantedBy: 'actor-1',
    });
  });

  it('asks for enrolment:delete when revoking', async () => {
    await putEnrolmentHandler(req({ courseId: 3, granted: false }), '5');
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'enrolment',
      'delete',
    );
    expect(m.removeUserEnrolment).toHaveBeenCalledWith('user-5', 3);
  });

  it('refuses when the target holds a role', async () => {
    m.assertCanActOnProfile.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await putEnrolmentHandler(
      req({ courseId: 3, granted: true }),
      '5',
    );
    expect(res.status).toBe(403);
    expect(m.addUserEnrolment).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/users/:id', () => {
  it('checks the target is not privileged before writing', async () => {
    m.assertCanActOnProfile.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchUserHandler(req({ firstName: 'Mallory' }), '5');
    expect(res.status).toBe(403);
    expect(m.updateUserProfile).not.toHaveBeenCalled();
  });

  it('never forwards email or associateNumber even if posted', async () => {
    await patchUserHandler(
      req({ firstName: 'A', email: 'attacker@evil.com', associateNumber: 'X' }),
      '5',
    );
    // zod strips unknown keys; asserting on what the DB layer RECEIVED is the
    // only way to see that a posted email can't reach the row.
    expect(m.updateUserProfile).toHaveBeenCalledWith(5, { firstName: 'A' });
  });
});

describe('PUT /api/admin/users/:id/roles — owner only', () => {
  it('uses the owner guard, not a permission', async () => {
    m.setUserRole.mockResolvedValueOnce({ ok: true });
    await putUserRoleHandler(req({ role: 'admin', granted: true }), '5');
    expect(m.requireOwner).toHaveBeenCalled();
    expect(m.requirePermission).not.toHaveBeenCalled();
  });

  it('409s the last-owner removal with a reason that says what to do', async () => {
    m.setUserRole.mockResolvedValueOnce({ ok: false, reason: 'last-owner' });
    const res = await putUserRoleHandler(
      req({ role: 'owner', granted: false }),
      '5',
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/last owner/i);
  });

  it('records the acting owner as the assigner', async () => {
    m.setUserRole.mockResolvedValueOnce({ ok: true });
    await putUserRoleHandler(req({ role: 'admin', granted: true }), '5');
    expect(m.setUserRole).toHaveBeenCalledWith({
      profileId: 5,
      roleName: 'admin',
      granted: true,
      actorUserId: 'owner-1',
    });
  });
});

describe('PUT /api/admin/role-permissions — owner only', () => {
  it('refuses to configure the owner role', async () => {
    m.setRolePermission.mockResolvedValueOnce({ ok: false, reason: 'owner' });
    const res = await putRolePermissionHandler(
      req({ role: 'owner', entity: 'user', action: 'read', granted: true }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/bypass/i);
  });

  it('grants on a normal role', async () => {
    m.setRolePermission.mockResolvedValueOnce({ ok: true });
    const res = await putRolePermissionHandler(
      req({
        role: 'admin',
        entity: 'enrolment',
        action: 'create',
        granted: true,
      }),
    );
    expect(res.status).toBe(204);
    expect(m.setRolePermission).toHaveBeenCalledWith({
      roleName: 'admin',
      entity: 'enrolment',
      action: 'create',
      granted: true,
    });
  });

  it('rejects an entity that has no endpoint behind it', async () => {
    const res = await putRolePermissionHandler(
      req({ role: 'admin', entity: 'course', action: 'delete', granted: true }),
    );
    expect(res.status).toBe(400);
    expect(m.setRolePermission).not.toHaveBeenCalled();
  });
});
