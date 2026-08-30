// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  ensureUserProfile: vi.fn(),
  getUserRoleNames: vi.fn(),
  getUserPermissions: vi.fn(),
  isAnyCourseStaff: vi.fn(),
  isAnyDisciplineStaff: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/db/user-profile', () => ({
  ensureUserProfile: m.ensureUserProfile,
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/permissions', () => ({
  getUserPermissions: m.getUserPermissions,
}));
vi.mock('#/db/course-staff', () => ({
  isAnyCourseStaff: m.isAnyCourseStaff,
}));
vi.mock('#/db/discipline-staff', () => ({
  isAnyDisciplineStaff: m.isAnyDisciplineStaff,
}));

import { resolveAuthContext } from '#/lib/auth-context.server';

const HEADERS = new Headers();

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({
    user: { id: 'user-1', email: 'pilot@example.com' },
  });
  m.ensureUserProfile.mockResolvedValue(undefined);
  m.getUserRoleNames.mockResolvedValue([]);
  m.getUserPermissions.mockResolvedValue(new Set<string>());
  m.isAnyCourseStaff.mockResolvedValue(false);
  m.isAnyDisciplineStaff.mockResolvedValue(false);
});

/**
 * The repair only works if it is actually handed this session's user, which
 * nothing downstream reveals — `getUserRoleNames` returns `[]` both for "no
 * profile" and "no roles". So these assert the arguments the collaborator
 * received rather than the shape of the returned context.
 */
describe('resolveAuthContext', () => {
  it("hands the session's user to the profile ensure", async () => {
    await resolveAuthContext(HEADERS);

    expect(m.ensureUserProfile).toHaveBeenCalledWith(
      'user-1',
      'pilot@example.com',
    );
  });

  it('ensures the profile BEFORE reading roles', async () => {
    const order: string[] = [];
    m.ensureUserProfile.mockImplementation(async () => {
      order.push('ensure');
    });
    m.getUserRoleNames.mockImplementation(async () => {
      order.push('roles');
      return [];
    });

    await resolveAuthContext(HEADERS);

    // getUserRoleNames joins user_profiles: run it first and a freshly
    // repaired admin reads back as having no roles, silently losing access
    // for that request.
    expect(order).toEqual(['ensure', 'roles']);
  });

  it('does not touch the database without a session', async () => {
    m.getSession.mockResolvedValueOnce(null);

    const result = await resolveAuthContext(HEADERS);

    expect(m.ensureUserProfile).not.toHaveBeenCalled();
    expect(m.getUserRoleNames).not.toHaveBeenCalled();
    expect(m.isAnyCourseStaff).not.toHaveBeenCalled();
    expect(m.isAnyDisciplineStaff).not.toHaveBeenCalled();
    expect(result).toEqual({
      session: null,
      roles: [],
      permissions: [],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });
  });

  it('still returns roles when the profile ensure fails', async () => {
    m.ensureUserProfile.mockRejectedValueOnce(new Error('db down'));
    m.getUserRoleNames.mockResolvedValueOnce(['admin']);

    const result = await resolveAuthContext(HEADERS);

    // This is the fallback path, not the primary one — a transient write
    // error must not take down every authenticated page load.
    expect(result.roles).toEqual(['admin']);
  });

  it('falls back to no roles when the role lookup fails', async () => {
    m.getUserRoleNames.mockRejectedValueOnce(new Error('db down'));

    const result = await resolveAuthContext(HEADERS);

    expect(result.roles).toEqual([]);
  });

  it('carries permissions into router context, serialised as an array', async () => {
    m.getUserRoleNames.mockResolvedValueOnce(['admin']);
    m.getUserPermissions.mockResolvedValueOnce(new Set(['enrolment:create']));

    const result = await resolveAuthContext(HEADERS);

    // Route gating reads this in `beforeLoad`; a Set would not survive the
    // wire, so the array form is the contract.
    expect(result.permissions).toEqual(['enrolment:create']);
  });

  it("passes the owner's wildcard through untouched", async () => {
    m.getUserRoleNames.mockResolvedValueOnce(['owner']);
    m.getUserPermissions.mockResolvedValueOnce(new Set(['*']));

    const result = await resolveAuthContext(HEADERS);

    expect(result.permissions).toEqual(['*']);
  });

  it('degrades to no permissions if the lookup fails', async () => {
    m.getUserPermissions.mockRejectedValueOnce(new Error('db down'));

    const result = await resolveAuthContext(HEADERS);

    // Failing closed: a transient error must hide controls, never reveal them.
    expect(result.permissions).toEqual([]);
  });

  /**
   * `/admin`'s entry guard reads `isStaffAnywhere` and nothing else can tell it
   * a subject expert apart from a learner — `roles` and `permissions` are both
   * global, and a scoped role appears in neither. The Courses nav link reads
   * `isCourseStaffAnywhere` instead, so the two must be produced separately
   * and must be allowed to disagree.
   */
  it("reports course staff on both fields, asking about THIS session's user", async () => {
    m.isAnyCourseStaff.mockResolvedValueOnce(true);

    const result = await resolveAuthContext(HEADERS);

    expect(m.isAnyCourseStaff).toHaveBeenCalledWith('user-1');
    // A course_staff row satisfies both questions: they are staff somewhere,
    // and the course index has their courses in it.
    expect(result.isStaffAnywhere).toBe(true);
    expect(result.isCourseStaffAnywhere).toBe(true);
  });

  it('reports a discipline-only SME as staff, but not as course staff', async () => {
    m.isAnyDisciplineStaff.mockResolvedValueOnce(true);

    const result = await resolveAuthContext(HEADERS);

    // The two staff tables are deliberately independent — no backfill links
    // them (see `migrate-discipline-staff.ts`) — so an SME with authority over
    // a discipline's lesson content can hold zero `course_staff` rows. Reading
    // only `course_staff` here shut them out of `/admin`, the only route to
    // the work they own.
    expect(m.isAnyDisciplineStaff).toHaveBeenCalledWith('user-1');
    expect(result.isStaffAnywhere).toBe(true);
    // And they still get no Courses link: they staff no course, so that index
    // would be empty for them.
    expect(result.isCourseStaffAnywhere).toBe(false);
  });

  it('does not ask about discipline_staff once course_staff has answered', async () => {
    m.isAnyCourseStaff.mockResolvedValueOnce(true);

    await resolveAuthContext(HEADERS);

    // The union short-circuits in the same order `permissions.server.ts`'s
    // `isStaffAnywhere` does. This runs on every authenticated page load, so a
    // second index lookup that cannot change the answer is one nobody should
    // pay for.
    expect(m.isAnyDisciplineStaff).not.toHaveBeenCalled();
  });

  it('reports no staffing for someone with no staff row in either table', async () => {
    const result = await resolveAuthContext(HEADERS);

    expect(result.isStaffAnywhere).toBe(false);
    expect(result.isCourseStaffAnywhere).toBe(false);
  });

  it('degrades to not-staff if the course staff lookup fails', async () => {
    m.isAnyCourseStaff.mockRejectedValueOnce(new Error('db down'));

    const result = await resolveAuthContext(HEADERS);

    // Failing closed, like the two lookups beside it: a transient error must
    // shut the admin console, never open it.
    expect(result.isStaffAnywhere).toBe(false);
    expect(result.isCourseStaffAnywhere).toBe(false);
  });

  it('degrades to not-staff if the discipline staff lookup fails', async () => {
    m.isAnyDisciplineStaff.mockRejectedValueOnce(new Error('db down'));

    const result = await resolveAuthContext(HEADERS);

    expect(result.isStaffAnywhere).toBe(false);
  });

  /**
   * An admin with no staff row anywhere is staff (globally), but is not course
   * staff: `isCourseStaffAnywhere` names one table and must keep meaning that
   * table, or it becomes a second copy of the union it was split out from. The
   * Courses link they do see comes from their `course:read` grant.
   */
  it('reports an admin as staff anywhere without claiming course staffing', async () => {
    m.getUserRoleNames.mockResolvedValueOnce(['admin']);

    const result = await resolveAuthContext(HEADERS);

    expect(result.isStaffAnywhere).toBe(true);
    expect(result.isCourseStaffAnywhere).toBe(false);
    // Admin satisfies the union first, so the discipline lookup is skipped.
    expect(m.isAnyDisciplineStaff).not.toHaveBeenCalled();
  });

  /**
   * An admin who is also staff somewhere must not have one answer mask the
   * other — the guard ORs them, and the nav gates on them separately.
   */
  it('carries roles, permissions and staffing together', async () => {
    m.getUserRoleNames.mockResolvedValueOnce(['admin']);
    m.getUserPermissions.mockResolvedValueOnce(new Set(['course:read']));
    m.isAnyCourseStaff.mockResolvedValueOnce(true);

    const result = await resolveAuthContext(HEADERS);

    expect(result).toMatchObject({
      roles: ['admin'],
      permissions: ['course:read'],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: true,
    });
  });
});
