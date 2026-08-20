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
    requireCoursePermission: vi.fn(),
    listCourseStaff: vi.fn(),
    assignCourseStaff: vi.fn(),
    removeCourseStaff: vi.fn(),
    addUserEnrolment: vi.fn(),
  };
});

vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/course-staff', () => ({
  listCourseStaff: m.listCourseStaff,
  assignCourseStaff: m.assignCourseStaff,
  removeCourseStaff: m.removeCourseStaff,
}));
vi.mock('#/db/users', () => ({
  addUserEnrolment: m.addUserEnrolment,
}));

import {
  deleteCourseStaffHandler,
  getCourseStaffHandler,
  putCourseStaffHandler,
} from '../courses.$courseId.staff';

const ADMIN = {
  userId: 'a1',
  roles: ['admin'],
  courseRoles: [],
  permissions: new Set<string>(),
  isOwner: false,
};
const SME = {
  userId: 's1',
  roles: [],
  courseRoles: ['subject-expert'],
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
  m.requireCoursePermission.mockResolvedValue(ADMIN);
  m.listCourseStaff.mockResolvedValue([]);
  m.assignCourseStaff.mockResolvedValue({ ok: true });
});

describe('PUT /api/admin/courses/:courseId/staff', () => {
  it('asks for staff:create on that course', async () => {
    await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'staff',
      'create',
    );
  });

  it('records the acting user as the assigner', async () => {
    await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );
    expect(m.assignCourseStaff).toHaveBeenCalledWith({
      userId: 'u9',
      courseId: 7,
      roleName: 'course-manager',
      assignedBy: 'a1',
    });
  });

  it('lets an admin assign a subject expert', async () => {
    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'subject-expert' }),
      '7',
    );
    expect(res.status).toBe(204);
  });

  it('lets an admin assign a course manager', async () => {
    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );
    expect(res.status).toBe(204);
    expect(m.assignCourseStaff).toHaveBeenCalledWith({
      userId: 'u9',
      courseId: 7,
      roleName: 'course-manager',
      assignedBy: 'a1',
    });
  });

  it('refuses an SME appointing another SME', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);
    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'subject-expert' }),
      '7',
    );
    expect(res.status).toBe(403);
    expect(m.assignCourseStaff).not.toHaveBeenCalled();
  });

  it('admits an admin who is also an SME on this course — the rail reads global roles, not course roles', async () => {
    m.requireCoursePermission.mockResolvedValue({
      userId: 'a2',
      roles: ['admin'],
      courseRoles: ['subject-expert'],
      permissions: new Set<string>(),
      isOwner: false,
    });
    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'subject-expert' }),
      '7',
    );
    expect(res.status).toBe(204);
    expect(m.assignCourseStaff).toHaveBeenCalledWith({
      userId: 'u9',
      courseId: 7,
      roleName: 'subject-expert',
      assignedBy: 'a2',
    });
  });

  it('lets an SME appoint a course manager', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);
    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );
    expect(res.status).toBe(204);
    expect(m.assignCourseStaff).toHaveBeenCalledWith({
      userId: 'u9',
      courseId: 7,
      roleName: 'course-manager',
      assignedBy: 's1',
    });
  });

  it('rejects a role that is not course-scoped', async () => {
    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'admin' }),
      '7',
    );
    expect(res.status).toBe(400);
    expect(m.assignCourseStaff).not.toHaveBeenCalled();
    expect(m.addUserEnrolment).not.toHaveBeenCalled();
  });

  it('maps assignCourseStaff not-assignable to 400', async () => {
    m.assignCourseStaff.mockResolvedValue({
      ok: false,
      reason: 'not-assignable',
    });
    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );
    expect(res.status).toBe(400);
    expect(m.addUserEnrolment).not.toHaveBeenCalled();
  });

  it('403s when the guard refuses, before writing', async () => {
    m.requireCoursePermission.mockRejectedValue(new m.ForbiddenError());
    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );
    expect(res.status).toBe(403);
    expect(m.assignCourseStaff).not.toHaveBeenCalled();
    expect(m.addUserEnrolment).not.toHaveBeenCalled();
  });

  it('enrols the appointee in the course, as the acting user', async () => {
    await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );
    expect(m.addUserEnrolment).toHaveBeenCalledWith({
      userId: 'u9',
      courseId: 7,
      grantedBy: 'a1',
    });
  });

  it('does not enrol when the assignment itself fails', async () => {
    m.assignCourseStaff.mockResolvedValue({ ok: false, reason: 'not-found' });
    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );
    expect(res.status).toBe(404);
    expect(m.addUserEnrolment).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/courses/:courseId/staff', () => {
  it('asks for staff:delete and removes the assignment', async () => {
    await deleteCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }, 'DELETE'),
      '7',
    );
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'staff',
      'delete',
    );
    expect(m.removeCourseStaff).toHaveBeenCalledWith('u9', 7, 'course-manager');
  });

  it('does not touch enrolment on removal', async () => {
    await deleteCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }, 'DELETE'),
      '7',
    );
    expect(m.addUserEnrolment).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/courses/:courseId/staff', () => {
  it('asks for staff:read', async () => {
    await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'staff',
      'read',
    );
  });

  it('returns the roster from listCourseStaff', async () => {
    const roster = [
      {
        userId: 'u9',
        email: 'a@b.com',
        firstName: null,
        lastName: null,
        roles: ['course-manager'],
      },
    ];
    m.listCourseStaff.mockResolvedValue(roster);
    const res = await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect(await res.json()).toEqual(roster);
  });
});
