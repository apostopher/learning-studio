// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserRoleNames: vi.fn(),
  getUserPermissions: vi.fn(),
  isAnyCourseStaff: vi.fn(),
  isCourseManagerAnywhere: vi.fn(),
  isAnyDisciplineStaff: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({
  auth: { api: { getSession: m.getSession } },
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/course-staff', () => ({
  getCourseRoleNames: vi.fn(),
  isAnyCourseStaff: m.isAnyCourseStaff,
  isCourseManagerAnywhere: m.isCourseManagerAnywhere,
  getStaffCourseIds: vi.fn(),
}));
vi.mock('#/db/discipline-staff', () => ({
  getDisciplineRoleNames: vi.fn(),
  isAnyDisciplineStaff: m.isAnyDisciplineStaff,
}));
// Same partial-mock shape as `require-course-permission.test.ts`: the real
// `hasPermission` stays reachable with no database machinery behind it.
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
import {
  requireCourseCreation,
  requireDisciplineCreation,
} from '#/lib/permissions.server';

const HEADERS = new Headers();

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getUserPermissions.mockResolvedValue(new Set<string>());
  m.isAnyCourseStaff.mockResolvedValue(false);
  m.isCourseManagerAnywhere.mockResolvedValue(false);
  m.isAnyDisciplineStaff.mockResolvedValue(false);
});

/**
 * Both guards were shipped with no direct tests at all — every reference in
 * the tree was a `vi.fn()` stub inside a route test, which proves which guard
 * a route calls and nothing about the guard's own union logic.
 */
describe('requireCourseCreation', () => {
  it('admits an admin holding course:create', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);
    m.getUserPermissions.mockResolvedValue(new Set(['course:create']));

    await expect(requireCourseCreation(HEADERS)).resolves.toBeUndefined();
    // Settled by the permission alone — the course-manager branch is a
    // fallback, not the primary path.
    expect(m.isCourseManagerAnywhere).not.toHaveBeenCalled();
  });

  it('admits a course manager, who can never satisfy the admin floor', async () => {
    // `requirePermission` refuses anyone who is not admin or owner BEFORE it
    // looks at a grant, so a course manager could never pass it however the
    // grants were configured. This union is the only reason RBAC rule 5 works.
    m.isCourseManagerAnywhere.mockResolvedValue(true);

    await expect(requireCourseCreation(HEADERS)).resolves.toBeUndefined();
  });

  it('refuses a subject expert staffed on a course', async () => {
    // THE mutant this file exists for: `isCourseManagerAnywhere` swapped for
    // `isAnyCourseStaff`. It type-checks, the whole suite stays green, and it
    // admits every subject expert staffed on any course to course creation —
    // precisely the population rule 5 excludes.
    m.isAnyCourseStaff.mockResolvedValue(true);
    m.isCourseManagerAnywhere.mockResolvedValue(false);

    await expect(requireCourseCreation(HEADERS)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('refuses a signed-out caller without asking the database', async () => {
    m.getSession.mockResolvedValue(null);

    await expect(requireCourseCreation(HEADERS)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(m.isCourseManagerAnywhere).not.toHaveBeenCalled();
  });

  it('lets an outage escape rather than demoting the caller', async () => {
    // Mutant this catches: the `instanceof ForbiddenError` rethrow dropped, so
    // a database outage reads as "not an admin", falls through to the
    // course-manager branch, and surfaces as a 403 — an outage disguised as an
    // authorization decision.
    m.getUserRoleNames.mockRejectedValue(new Error('db down'));

    await expect(requireCourseCreation(HEADERS)).rejects.toThrow('db down');
  });
});

describe('requireDisciplineCreation', () => {
  it('admits an admin', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);
    await expect(requireDisciplineCreation(HEADERS)).resolves.toBeUndefined();
  });

  it('admits a course manager and a discipline-only subject expert', async () => {
    // RBAC rule 1 lists all three populations, and `course_staff` /
    // `discipline_staff` can only ever name a course manager or a subject
    // expert — so "staff anywhere" and "one of those three" are the same set.
    m.isAnyCourseStaff.mockResolvedValue(true);
    await expect(requireDisciplineCreation(HEADERS)).resolves.toBeUndefined();

    m.isAnyCourseStaff.mockResolvedValue(false);
    m.isAnyDisciplineStaff.mockResolvedValue(true);
    await expect(requireDisciplineCreation(HEADERS)).resolves.toBeUndefined();
  });

  it('refuses a learner who is staff nowhere', async () => {
    // Mutant this catches: the guard emptied to a bare `return`, which reads
    // as "creation is open to any signed-in admin user" and is not.
    await expect(requireDisciplineCreation(HEADERS)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('refuses a signed-out caller', async () => {
    m.getSession.mockResolvedValue(null);
    await expect(requireDisciplineCreation(HEADERS)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
