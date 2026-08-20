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

// `permissions` mirrors what the real `requireCoursePermission` returns: it
// resolves the grant set BEFORE letting the request through, so an actor who
// reached a `staff:create` handler necessarily holds that key. The guard is
// mocked here, so these stand in for it.
const ADMIN = {
  userId: 'a1',
  roles: ['admin'],
  courseRoles: [],
  permissions: new Set<string>(['staff:read', 'staff:create']),
  isOwner: false,
};
const SME = {
  userId: 's1',
  roles: [],
  courseRoles: ['subject-expert'],
  permissions: new Set<string>(['staff:read', 'staff:create']),
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
      permissions: new Set<string>(['staff:read', 'staff:create']),
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
    expect((await res.json()).staff).toEqual(roster);
  });

  /**
   * The panel renders its role picker from this, so it is the only thing
   * standing between an actor and an option the PUT would refuse. It is the
   * SERVER's answer, not a client re-derivation of the same policy.
   */
  it('offers an admin both course-scoped roles', async () => {
    const res = await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect((await res.json()).assignableRoles).toEqual([
      'subject-expert',
      'course-manager',
    ]);
  });

  it('offers an SME only a course manager, never a peer', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);
    const res = await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect((await res.json()).assignableRoles).toEqual(['course-manager']);
  });

  it('offers nothing to an actor who can read the roster but not add to it', async () => {
    m.requireCoursePermission.mockResolvedValue({
      ...ADMIN,
      permissions: new Set<string>(['staff:read']),
    });
    const res = await getCourseStaffHandler(req(undefined, 'GET'), '7');
    // `staff:read` and `staff:create` are independently grantable, so an empty
    // set here is what hides the assign form entirely.
    expect((await res.json()).assignableRoles).toEqual([]);
  });
});

/**
 * The picker and the guard must be one rule, not two. These pin the GET's
 * advertised set to the PUT's enforcement for the same actor — if they ever
 * disagree, the panel offers a role the write refuses (or hides one it would
 * have allowed).
 */
describe('the offered roles and the enforced roles are the same rule', () => {
  it.each([
    ['admin', ADMIN],
    ['subject expert', SME],
  ])('agree for a %s', async (_label, actor) => {
    m.requireCoursePermission.mockResolvedValue(actor);

    const offered: string[] = (
      await (await getCourseStaffHandler(req(undefined, 'GET'), '7')).json()
    ).assignableRoles;

    for (const role of ['subject-expert', 'course-manager']) {
      const res = await putCourseStaffHandler(req({ userId: 'u9', role }), '7');
      expect({ role, accepted: res.status === 204 }).toEqual({
        role,
        accepted: offered.includes(role),
      });
    }
  });
});
