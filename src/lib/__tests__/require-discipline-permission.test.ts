// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserRoleNames: vi.fn(),
  getDisciplineRoleNames: vi.fn(),
  getUserPermissions: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({
  auth: { api: { getSession: m.getSession } },
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/discipline-staff', () => ({
  getDisciplineRoleNames: m.getDisciplineRoleNames,
}));
vi.mock('#/db/course-staff', () => ({
  getCourseRoleNames: vi.fn(),
  getStaffCourseIds: vi.fn(),
  isAnyCourseStaff: vi.fn(),
}));
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  },
  requireAdmin: vi.fn(),
}));
// `hasPermission` is pure — stubbing it would mean the wildcard logic under
// test was written twice and could drift — so `#/db/permissions` is only
// partially mocked. Loading it for real pulls in `#/db`, whose module body
// constructs a pg Pool, and the whole schema graph behind it. These two stubs
// keep the real `hasPermission` reachable with no database machinery at all.
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

import { ForbiddenError } from '#/lib/admin-functions.server';
import { requireDisciplinePermission } from '#/lib/permissions.server';

const HEADERS = new Headers();

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getDisciplineRoleNames.mockResolvedValue([]);
  m.getUserPermissions.mockResolvedValue(new Set<string>());
});

describe('requireDisciplinePermission', () => {
  it('admits a subject expert on their own discipline', async () => {
    m.getDisciplineRoleNames.mockResolvedValue(['subject-expert']);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    await expect(
      requireDisciplinePermission(HEADERS, 7, 'content', 'update'),
    ).resolves.toBeUndefined();

    expect(m.getDisciplineRoleNames).toHaveBeenCalledWith('u1', 7);
    // The grants lookup must actually receive the discipline role — asserting
    // only "it resolved" leaves this free to be dropped.
    expect(m.getUserPermissions).toHaveBeenCalledWith(['subject-expert']);
  });

  it('refuses a subject expert on a discipline they are not staff on', async () => {
    m.getDisciplineRoleNames.mockResolvedValue([]);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    await expect(
      requireDisciplinePermission(HEADERS, 99, 'content', 'update'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  // RBAC rule 3: an admin may CRUD every lesson. This REPLACES the older test
  // that pinned the opposite (admin refused, per the reverted d4f767d note and
  // migrate-staff-roles.ts:78, which withheld `content` from admin so senior
  // staff would administer rather than author). That policy was superseded by
  // an explicit ruling; the admin is admitted by BYPASS, holding no `content`
  // grant at all — which is exactly what makes the bypass load-bearing rather
  // than decorative.
  it('admits an admin who holds no content grant — RBAC rule 3', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);
    m.getDisciplineRoleNames.mockResolvedValue([]);
    m.getUserPermissions.mockResolvedValue(new Set(['course:update']));

    await expect(
      requireDisciplinePermission(HEADERS, 7, 'content', 'update'),
    ).resolves.toBeUndefined();
  });

  it('still refuses a signed-in non-admin with no grant and no discipline row', async () => {
    // The bypass must widen, not open. Mutant this catches: replacing the
    // permission check with `return` outright, or reading the union of global
    // AND scoped roles for admin-ness — a `discipline_staff` row naming a role
    // called `admin` would then mint org-wide authority from a scoped grant.
    m.getUserRoleNames.mockResolvedValue(['course-manager']);
    m.getDisciplineRoleNames.mockResolvedValue(['admin']);
    m.getUserPermissions.mockResolvedValue(new Set(['structure:update']));

    await expect(
      requireDisciplinePermission(HEADERS, 7, 'content', 'update'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  /**
   * A subject expert holds DISCIPLINES, never a global role — see
   * `SCOPE_ONLY_ROLES`. The role was assignable globally before, so accounts
   * carrying one may still exist; the filter is what makes the rule true for
   * them rather than only for accounts touched since.
   */
  it('grants nothing to a subject-expert role held globally', async () => {
    // Exactly the shape that used to work: the role in `user_roles`, no
    // discipline row, and `getUserPermissions` answering as it does for that
    // role's grants. Mutant this catches: dropping the filter in
    // `requireScopedPermission` — this person would hold content:* over EVERY
    // discipline in the org, and the roster they are not on would be
    // decorative.
    m.getUserRoleNames.mockResolvedValue(['subject-expert']);
    m.getDisciplineRoleNames.mockResolvedValue([]);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    await expect(
      requireDisciplinePermission(HEADERS, 7, 'content', 'update'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('still admits the same person on a discipline they DO hold', async () => {
    // The other half, and the one that makes the filter a narrowing rather
    // than a removal: the authority is real, it just comes from the scope row.
    m.getUserRoleNames.mockResolvedValue(['subject-expert']);
    m.getDisciplineRoleNames.mockResolvedValue(['subject-expert']);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    await expect(
      requireDisciplinePermission(HEADERS, 7, 'content', 'update'),
    ).resolves.toBeUndefined();
  });

  it('admits an owner anywhere via the wildcard', async () => {
    m.getUserRoleNames.mockResolvedValue(['owner']);
    m.getUserPermissions.mockResolvedValue(new Set(['*']));

    await expect(
      requireDisciplinePermission(HEADERS, 7, 'content', 'delete'),
    ).resolves.toBeUndefined();
  });

  it('throws a programming error, not a refusal, for a non-discipline-scoped entity', async () => {
    m.getUserRoleNames.mockResolvedValue(['owner']);
    m.getUserPermissions.mockResolvedValue(new Set(['*']));

    const error = await requireDisciplinePermission(
      HEADERS,
      7,
      'structure',
      'update',
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ForbiddenError);
    expect(m.getDisciplineRoleNames).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller before touching the database', async () => {
    m.getSession.mockResolvedValue(null);

    await expect(
      requireDisciplinePermission(HEADERS, 7, 'content', 'read'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(m.getDisciplineRoleNames).not.toHaveBeenCalled();
  });
});
