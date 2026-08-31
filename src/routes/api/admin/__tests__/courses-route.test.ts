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
    requireCourseCreation: vi.fn(),
    getStaffScopedCourseIds: vi.fn(),
    listAdminCourses: vi.fn(),
    createCourse: vi.fn(),
    getActiveOrgId: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requirePermission: m.requirePermission,
  requireCourseCreation: m.requireCourseCreation,
  getStaffScopedCourseIds: m.getStaffScopedCourseIds,
}));
vi.mock('#/db/admin', () => ({
  listAdminCourses: m.listAdminCourses,
  createCourse: m.createCourse,
}));
vi.mock('#/lib/active-org.server', () => ({
  getActiveOrgId: m.getActiveOrgId,
}));

import { createCourseHandler, listAdminCoursesHandler } from '../courses';

const COURSES = [{ id: 1, name: 'PPL' }];
const NEW_COURSE = { id: 2, name: 'CPL' };

function getReq(): Request {
  return new Request('http://t/api/admin/courses', { method: 'GET' });
}

function postReq(body: unknown = { name: 'CPL' }): Request {
  return new Request('http://t/api/admin/courses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePermission.mockResolvedValue({ userId: 'u1' });
  m.getStaffScopedCourseIds.mockResolvedValue([]);
  m.listAdminCourses.mockResolvedValue(COURSES);
  m.createCourse.mockResolvedValue(NEW_COURSE);
  m.getActiveOrgId.mockReturnValue(1);
});

describe('listAdminCoursesHandler', () => {
  it('asks for course:read — org-level, not per-course', async () => {
    await listAdminCoursesHandler(getReq());
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'course',
      'read',
    );
  });

  it('returns the list on success', async () => {
    const res = await listAdminCoursesHandler(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(COURSES);
  });

  it('lists the whole catalogue, unfiltered, for course:read', async () => {
    await listAdminCoursesHandler(getReq());
    // `undefined`, not `[]` — an empty id list would mean "these zero
    // courses" and silently blank the catalogue for every admin.
    expect(m.listAdminCourses).toHaveBeenCalledWith();
    expect(m.getStaffScopedCourseIds).not.toHaveBeenCalled();
  });

  it('403s when refused, without listing courses', async () => {
    m.requirePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await listAdminCoursesHandler(getReq());
    expect(res.status).toBe(403);
    expect(m.listAdminCourses).not.toHaveBeenCalled();
  });

  /**
   * A subject expert holds no `course:read` — that grant is the whole
   * catalogue, and "a Biology SME cannot teach Computer Science" is precisely
   * why they must not have it. Without this fallback /admin's index, which the
   * route guard now admits them to, answers 403 and they can reach neither the
   * editor nor the staff panel built for them.
   */
  it('falls back to the courses a staff-only actor is staffed on', async () => {
    m.requirePermission.mockRejectedValueOnce(new m.ForbiddenError());
    m.getStaffScopedCourseIds.mockResolvedValueOnce([4, 9]);
    const res = await listAdminCoursesHandler(getReq());
    expect(res.status).toBe(200);
    // The narrowing has to reach the query — a scoped response that still asks
    // for every course would hand a professor the whole catalogue.
    expect(m.listAdminCourses).toHaveBeenCalledWith([4, 9]);
  });

  it('403s an actor refused course:read who is staff on nothing', async () => {
    m.requirePermission.mockRejectedValueOnce(new m.ForbiddenError());
    m.getStaffScopedCourseIds.mockResolvedValueOnce([]);
    const res = await listAdminCoursesHandler(getReq());
    expect(res.status).toBe(403);
    // Never `[]` with a 200: that reads as "no courses exist" to the page.
    expect(m.listAdminCourses).not.toHaveBeenCalled();
  });

  it('rethrows non-ForbiddenError failures', async () => {
    m.requirePermission.mockRejectedValueOnce(new Error('db down'));
    await expect(listAdminCoursesHandler(getReq())).rejects.toThrow('db down');
    // A database outage must not be mistaken for "not permitted" and quietly
    // downgraded into the staff-scoped view.
    expect(m.getStaffScopedCourseIds).not.toHaveBeenCalled();
  });
});

describe('createCourseHandler', () => {
  /**
   * RBAC rule 5: a course manager or an admin may create an offering.
   *
   * The guard is `requireCourseCreation`, NOT `requirePermission('course',
   * 'create')`. That distinction is the test: `requirePermission` carries an
   * admin floor, refusing anyone who is not admin or owner before it looks at
   * a grant, so a course manager could never pass it however the grants were
   * configured. The union guard is where the course-manager branch lives.
   *
   * Mutant this catches: reverting to `guard(request, 'create')`, which still
   * type-checks, still 201s for an admin, and silently locks out every course
   * manager.
   */
  it('guards creation with the course-manager union, not the admin-floored permission check', async () => {
    await createCourseHandler(postReq());
    expect(m.requireCourseCreation).toHaveBeenCalledTimes(1);
    expect(m.requirePermission).not.toHaveBeenCalled();
  });

  it('creates the course on success', async () => {
    const res = await createCourseHandler(postReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(NEW_COURSE);
    expect(m.createCourse).toHaveBeenCalledWith({ name: 'CPL' }, 1);
  });

  it('403s when refused, without creating a course', async () => {
    m.requireCourseCreation.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await createCourseHandler(postReq());
    expect(res.status).toBe(403);
    expect(m.createCourse).not.toHaveBeenCalled();
  });

  /**
   * Founding a course still has no `course_staff`-scoped fallback: a subject
   * expert authors inside a course, they do not decide which courses exist.
   * Rule 5 admits course managers by ROLE, inside `requireCourseCreation` —
   * the read path's course-id fallback must not leak across into create.
   */
  it('offers no staff fallback on create', async () => {
    m.requireCourseCreation.mockRejectedValueOnce(new m.ForbiddenError());
    m.getStaffScopedCourseIds.mockResolvedValueOnce([4]);
    const res = await createCourseHandler(postReq());
    expect(res.status).toBe(403);
    expect(m.createCourse).not.toHaveBeenCalled();
  });

  it('400s invalid JSON before it would ever be persisted', async () => {
    const req = new Request('http://t/api/admin/courses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await createCourseHandler(req);
    expect(res.status).toBe(400);
    expect(m.createCourse).not.toHaveBeenCalled();
  });

  it('400s a body that fails schema validation', async () => {
    const res = await createCourseHandler(postReq({}));
    expect(res.status).toBe(400);
    expect(m.createCourse).not.toHaveBeenCalled();
  });
});
