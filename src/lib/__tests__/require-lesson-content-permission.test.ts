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
    getDisciplineRoleNames: vi.fn(),
    getUserPermissions: vi.fn(),
    requireAdmin: vi.fn(),
  };
});

vi.mock('#/lib/auth', () => ({
  auth: { api: { getSession: m.getSession } },
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/discipline-staff', () => ({
  getDisciplineRoleNames: m.getDisciplineRoleNames,
  getStaffRoleNames: vi.fn(),
}));
vi.mock('#/db/course-staff', () => ({
  getCourseRoleNames: vi.fn(),
  getStaffCourseIds: vi.fn(),
  isAnyCourseStaff: vi.fn(),
  getStaffRoleNames: vi.fn(),
}));
// `requireAdmin` is the org-level (null-discipline) half of the branch under
// test — stubbed so the assertions below can tell "the discipline path ran"
// from "the admin path ran" without a real session/role round trip for it.
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
  requireAdmin: m.requireAdmin,
}));
vi.mock('#/db', () => ({ db: {} }));
vi.mock('#/db/schema', () => ({
  rolePermissionsTable: {},
  userProfileRolesTable: {},
  userProfileTable: {},
  userRolesTable: {},
}));
vi.mock('#/db/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/db/permissions')>();
  return { ...actual, getUserPermissions: m.getUserPermissions };
});

import { requireLessonContentPermission } from '#/lib/permissions.server';

const HEADERS = new Headers();

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getDisciplineRoleNames.mockResolvedValue([]);
  m.getUserPermissions.mockResolvedValue(new Set<string>());
  m.requireAdmin.mockResolvedValue({ userId: 'admin-1', roles: ['admin'] });
});

describe('requireLessonContentPermission', () => {
  it('a non-null discipline routes to requireDisciplinePermission, not requireAdmin', async () => {
    m.getDisciplineRoleNames.mockResolvedValue(['subject-expert']);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    await requireLessonContentPermission(HEADERS, 7, 'update');

    expect(m.getDisciplineRoleNames).toHaveBeenCalledWith('u1', 7);
    expect(m.requireAdmin).not.toHaveBeenCalled();
  });

  it('refuses a discipline SME on the WRONG discipline (not called with a different id)', async () => {
    m.getDisciplineRoleNames.mockResolvedValue([]); // no role on discipline 7
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    await expect(
      requireLessonContentPermission(HEADERS, 7, 'update'),
    ).rejects.toBeInstanceOf(m.ForbiddenError);
  });

  it('refuses an org admin who holds no discipline SME row — pins the reverted d4f767d policy', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);
    m.getDisciplineRoleNames.mockResolvedValue([]);
    m.getUserPermissions.mockResolvedValue(new Set(['course:update']));

    await expect(
      requireLessonContentPermission(HEADERS, 7, 'update'),
    ).rejects.toBeInstanceOf(m.ForbiddenError);
    expect(m.requireAdmin).not.toHaveBeenCalled();
  });

  it('a null discipline ("Untitled") routes to requireAdmin, not requireDisciplinePermission', async () => {
    await requireLessonContentPermission(HEADERS, null, 'update');

    expect(m.requireAdmin).toHaveBeenCalledWith(HEADERS);
    expect(m.getDisciplineRoleNames).not.toHaveBeenCalled();
  });

  it('a null discipline refuses a discipline SME who holds no admin role', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());

    await expect(
      requireLessonContentPermission(HEADERS, null, 'update'),
    ).rejects.toBeInstanceOf(m.ForbiddenError);
    expect(m.getDisciplineRoleNames).not.toHaveBeenCalled();
  });
});
