// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserRoleNames: vi.fn(),
  getCourseRoleNames: vi.fn(),
  getUserPermissions: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({
  auth: { api: { getSession: m.getSession } },
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/course-staff', () => ({
  getCourseRoleNames: m.getCourseRoleNames,
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
import { requireCoursePermission } from '#/lib/permissions.server';

const HEADERS = new Headers();

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getCourseRoleNames.mockResolvedValue([]);
  m.getUserPermissions.mockResolvedValue(new Set<string>());
});

describe('requireCoursePermission', () => {
  it('admits a subject expert on their own course', async () => {
    m.getCourseRoleNames.mockResolvedValue(['subject-expert']);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    const actor = await requireCoursePermission(
      HEADERS,
      7,
      'content',
      'update',
    );

    expect(actor.userId).toBe('u1');
    expect(actor.courseRoles).toEqual(['subject-expert']);
    expect(m.getCourseRoleNames).toHaveBeenCalledWith('u1', 7);
    // The grants lookup must actually receive the course role — this is the
    // whole reason the guard exists, and asserting only on the returned actor
    // leaves it free to be dropped.
    expect(m.getUserPermissions).toHaveBeenCalledWith(['subject-expert']);
    // `roles` is the GLOBAL list. Folding the two together would erase the
    // distinction the staff-appointment guard depends on.
    expect(actor.roles).toEqual([]);
  });

  it('asks for grants under both hats, global first, for a mixed actor', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);
    m.getCourseRoleNames.mockResolvedValue(['subject-expert']);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    const actor = await requireCoursePermission(
      HEADERS,
      7,
      'content',
      'update',
    );

    // The exact concatenation: both halves present, global before course.
    expect(m.getUserPermissions).toHaveBeenCalledWith([
      'admin',
      'subject-expert',
    ]);
    expect(actor.roles).toEqual(['admin']);
    expect(actor.courseRoles).toEqual(['subject-expert']);
  });

  it('refuses a subject expert on a course they are not staff on', async () => {
    // Global roles empty, and no roles on THIS course.
    m.getCourseRoleNames.mockResolvedValue([]);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    await expect(
      requireCoursePermission(HEADERS, 99, 'content', 'update'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a course manager the content actions they lack', async () => {
    m.getCourseRoleNames.mockResolvedValue(['course-manager']);
    m.getUserPermissions.mockResolvedValue(
      new Set(['structure:update', 'content:read']),
    );

    await expect(
      requireCoursePermission(HEADERS, 7, 'content', 'update'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('admits a course manager the structure actions they hold', async () => {
    m.getCourseRoleNames.mockResolvedValue(['course-manager']);
    m.getUserPermissions.mockResolvedValue(new Set(['structure:update']));

    await expect(
      requireCoursePermission(HEADERS, 7, 'structure', 'update'),
    ).resolves.toMatchObject({ userId: 'u1' });
  });

  it('refuses an admin authoring content — they administer, they do not author', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);
    m.getCourseRoleNames.mockResolvedValue([]);
    // The seed grants admin course:* and staff:*, never structure/content.
    m.getUserPermissions.mockResolvedValue(new Set(['course:update']));

    await expect(
      requireCoursePermission(HEADERS, 7, 'content', 'update'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('admits an owner anywhere via the wildcard', async () => {
    m.getUserRoleNames.mockResolvedValue(['owner']);
    m.getUserPermissions.mockResolvedValue(new Set(['*']));

    await expect(
      requireCoursePermission(HEADERS, 7, 'content', 'delete'),
    ).resolves.toMatchObject({ isOwner: true });
  });

  it('throws a programming error, not a refusal, for an org-level entity', async () => {
    // An owner, who would otherwise be admitted to anything by the wildcard —
    // so this pins that the misuse is caught, not merely masked by a denial.
    m.getUserRoleNames.mockResolvedValue(['owner']);
    m.getUserPermissions.mockResolvedValue(new Set(['*']));

    const error = await requireCoursePermission(
      HEADERS,
      7,
      'user',
      'update',
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ForbiddenError);
    expect(m.getCourseRoleNames).not.toHaveBeenCalled();
  });

  it('does not let a course_staff row confer ownership', async () => {
    // `owner` held on ONE course, nothing globally. The union legitimately
    // yields the wildcard for this course, but `isOwner` is an org-level claim
    // and must stay false, or a per-course row would read as deployment-wide
    // authority everywhere it is inspected.
    m.getUserRoleNames.mockResolvedValue([]);
    m.getCourseRoleNames.mockResolvedValue(['owner']);
    m.getUserPermissions.mockResolvedValue(new Set(['*']));

    const actor = await requireCoursePermission(
      HEADERS,
      7,
      'content',
      'update',
    );

    expect(actor.isOwner).toBe(false);
    expect(actor.roles).toEqual([]);
    expect(actor.courseRoles).toEqual(['owner']);
  });

  it('refuses an anonymous caller before touching the database', async () => {
    m.getSession.mockResolvedValue(null);

    await expect(
      requireCoursePermission(HEADERS, 7, 'structure', 'read'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(m.getCourseRoleNames).not.toHaveBeenCalled();
  });
});
