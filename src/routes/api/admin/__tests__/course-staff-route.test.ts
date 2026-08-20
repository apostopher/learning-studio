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
  // `enrolment:create` is here because spec §3 gives it to `admin` — and the
  // auto-enrol on appointment now turns on holding it. The SME below
  // deliberately has no enrolment grant of any kind, which is spec §3 too.
  permissions: new Set<string>([
    'staff:read',
    'staff:create',
    'staff:delete',
    'enrolment:create',
  ]),
  isOwner: false,
};
const SME = {
  userId: 's1',
  roles: [],
  courseRoles: ['subject-expert'],
  permissions: new Set<string>(['staff:read', 'staff:create', 'staff:delete']),
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

  /**
   * Spec §3 gives `subject-expert` `enrolment: —`. An unconditional auto-enrol
   * handed them the effect of the grant anyway: appoint anyone as a course
   * manager, a `course_subscriptions` row is written, take the staff role away
   * again (removal deliberately does not un-enrol) and the access is permanent.
   * On a paid product that is a free-access dispenser held by someone with no
   * enrolment authority and no admin in the loop.
   */
  it('does not enrol the appointee when the actor holds no enrolment:create', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);

    const res = await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );

    // The appointment still lands — it is the enrolment that is not theirs
    // to grant.
    expect(res.status).toBe(204);
    expect(m.assignCourseStaff).toHaveBeenCalled();
    expect(m.addUserEnrolment).not.toHaveBeenCalled();
  });

  it("enrols on an owner's wildcard", async () => {
    m.requireCoursePermission.mockResolvedValue({
      userId: 'o1',
      roles: ['owner'],
      courseRoles: [],
      permissions: new Set(['*']),
      isOwner: true,
    });

    await putCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }),
      '7',
    );

    expect(m.addUserEnrolment).toHaveBeenCalledWith({
      userId: 'u9',
      courseId: 7,
      grantedBy: 'o1',
    });
  });

  /**
   * A user id the directory does not know used to reach the insert and raise
   * `course_staff.user_id`'s foreign key, which nothing catches — so a bad
   * request body read as a server fault.
   */
  it('404s an unknown appointee instead of raising the foreign key', async () => {
    m.assignCourseStaff.mockResolvedValue({
      ok: false,
      reason: 'unknown-user',
    });

    const res = await putCourseStaffHandler(
      req({ userId: 'nobody', role: 'course-manager' }),
      '7',
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found' });
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

  /**
   * Round 2. Spec §3 gives an SME "CRD (own courses, CRS-MGR only)" — the
   * qualifier governs delete as much as create. Unrailed, a subject expert
   * could clear every peer off their own course and become its sole
   * authority: the self-propagation hole the PUT rail closes, running in
   * reverse and worse, because removal is destructive and immediate.
   */
  it('refuses an SME removing a subject expert, and writes nothing', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);

    const res = await deleteCourseStaffHandler(
      req({ userId: 'u9', role: 'subject-expert' }, 'DELETE'),
      '7',
    );

    expect(res.status).toBe(403);
    expect(m.removeCourseStaff).not.toHaveBeenCalled();
  });

  /**
   * Resignation, restored. The delete rail exists to stop privilege
   * ESCALATION — an SME must not unseat a peer. Stepping down is privilege
   * reduction, which that rule has nothing to say about, and without the
   * exemption only an admin can take the role off a departing professor.
   */
  it('lets a subject expert remove THEMSELVES', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);

    const res = await deleteCourseStaffHandler(
      req({ userId: 's1', role: 'subject-expert' }, 'DELETE'),
      '7',
    );

    expect(res.status).toBe(204);
    expect(m.removeCourseStaff).toHaveBeenCalledWith('s1', 7, 'subject-expert');
  });

  /**
   * The exemption is spent on the actor's own id and nobody else's — the peer
   * rail has to survive it, or "an SME cannot unseat a professor" becomes
   * "unless they send a different user id".
   */
  it('still refuses an SME removing a DIFFERENT subject expert', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);

    const res = await deleteCourseStaffHandler(
      req({ userId: 'someone-else', role: 'subject-expert' }, 'DELETE'),
      '7',
    );

    expect(res.status).toBe(403);
    expect(m.removeCourseStaff).not.toHaveBeenCalled();
  });

  it('lets an SME remove a course manager', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);

    const res = await deleteCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }, 'DELETE'),
      '7',
    );

    expect(res.status).toBe(204);
    expect(m.removeCourseStaff).toHaveBeenCalledWith('u9', 7, 'course-manager');
  });

  it('lets an admin remove a subject expert', async () => {
    const res = await deleteCourseStaffHandler(
      req({ userId: 'u9', role: 'subject-expert' }, 'DELETE'),
      '7',
    );

    expect(res.status).toBe(204);
    expect(m.removeCourseStaff).toHaveBeenCalledWith('u9', 7, 'subject-expert');
  });

  it('lets an admin remove a course manager', async () => {
    const res = await deleteCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }, 'DELETE'),
      '7',
    );

    expect(res.status).toBe(204);
    expect(m.removeCourseStaff).toHaveBeenCalledWith('u9', 7, 'course-manager');
  });

  /** The rail reads GLOBAL roles, exactly as the PUT rail does. */
  it('admits an admin who is also an SME on this course', async () => {
    m.requireCoursePermission.mockResolvedValue({
      ...ADMIN,
      userId: 'a2',
      courseRoles: ['subject-expert'],
    });

    const res = await deleteCourseStaffHandler(
      req({ userId: 'u9', role: 'subject-expert' }, 'DELETE'),
      '7',
    );

    expect(res.status).toBe(204);
  });

  it('refuses every role when staff:delete is not granted', async () => {
    m.requireCoursePermission.mockResolvedValue({
      ...ADMIN,
      permissions: new Set(['staff:read', 'staff:create']),
    });

    const res = await deleteCourseStaffHandler(
      req({ userId: 'u9', role: 'course-manager' }, 'DELETE'),
      '7',
    );

    expect(res.status).toBe(403);
    expect(m.removeCourseStaff).not.toHaveBeenCalled();
  });
});

/**
 * The two rails are one rule. This pins the roles the GET advertises as
 * removable to what the DELETE actually accepts, per actor and per role — if
 * they ever disagree, the panel draws a Remove control the write refuses, or
 * hides one it would have allowed.
 */
describe('the offered removals and the enforced removals are the same rule', () => {
  it.each([
    ['admin', ADMIN],
    ['subject expert', SME],
  ])('agree for a %s', async (_label, actor) => {
    m.requireCoursePermission.mockResolvedValue(actor);

    const offered: string[] = (
      await (await getCourseStaffHandler(req(undefined, 'GET'), '7')).json()
    ).removableRoles;

    for (const role of ['subject-expert', 'course-manager']) {
      const res = await deleteCourseStaffHandler(
        req({ userId: 'u9', role }, 'DELETE'),
        '7',
      );
      expect({ role, accepted: res.status === 204 }).toEqual({
        role,
        accepted: offered.includes(role),
      });
    }
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

  /**
   * The panel draws the resignation control off this — without it a professor
   * has no Remove button on their own badge and cannot step down through the
   * UI at all.
   */
  it('tells the panel which user it is answering for', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);
    const res = await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect((await res.json()).selfUserId).toBe('s1');
  });

  it('offers an SME only a course manager, never a peer', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);
    const res = await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect((await res.json()).assignableRoles).toEqual(['course-manager']);
  });

  /**
   * The per-member Remove button rendered unconditionally before round 1, so a
   * `staff:read`-only actor got a live control that 403'd on click — and until
   * round 2 it was a flat boolean, which cannot express that an SME may
   * dismiss an assistant but not a peer.
   */
  it('lets an admin take away either role', async () => {
    const res = await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect((await res.json()).removableRoles).toEqual([
      'subject-expert',
      'course-manager',
    ]);
  });

  it('lets an SME take away only a course manager', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);
    const res = await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect((await res.json()).removableRoles).toEqual(['course-manager']);
  });

  it('withholds removal entirely from an actor without staff:delete', async () => {
    m.requireCoursePermission.mockResolvedValue({
      ...ADMIN,
      permissions: new Set(['staff:read', 'staff:create']),
    });
    const res = await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect((await res.json()).removableRoles).toEqual([]);
  });

  it("grants an owner's wildcard everything", async () => {
    m.requireCoursePermission.mockResolvedValue({
      userId: 'o1',
      roles: ['owner'],
      courseRoles: [],
      permissions: new Set(['*']),
      isOwner: true,
    });
    const body = await (
      await getCourseStaffHandler(req(undefined, 'GET'), '7')
    ).json();
    expect(body.removableRoles).toEqual(['subject-expert', 'course-manager']);
    expect(body.assignableRoles).toEqual(['subject-expert', 'course-manager']);
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
