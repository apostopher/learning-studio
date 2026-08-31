// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task 15: the org-level discipline surface — discipline CRUD and Subject
 * Expert assignment.
 *
 * Every handler here is `requireAdmin`, and that is the whole security
 * argument of the task. `discipline_staff` decides who may EDIT a lesson
 * (`requireLessonContentPermission` → `requireDisciplinePermission`), so a
 * route that let discipline-scoped authority write that table would let a
 * Subject Expert appoint a peer to their own discipline, or re-appoint
 * themselves after being removed. Assignment would be self-propagating and the
 * "an admin hires the experts" rule would survive exactly as far as the first
 * hire. The codebase already reasons this way in the other direction —
 * `migrate-staff-roles.ts:76-80` withholds `content` from `admin` because
 * senior staff administer and do not author.
 */
const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requireAdmin: vi.fn(),
    // Mocked so the tests can prove it is never consulted. If a future edit
    // swapped the guard for this one, the SME cases below would start passing
    // the guard and every "not called" assertion would fail.
    requireDisciplinePermission: vi.fn(),
    isStaffAnywhere: vi.fn(),
    listDisciplines: vi.fn(),
    createDiscipline: vi.fn(),
    renameDiscipline: vi.fn(),
    deleteDiscipline: vi.fn(),
    listDisciplineStaffByOrg: vi.fn(),
    assignDisciplineStaff: vi.fn(),
    removeDisciplineStaff: vi.fn(),
    searchStaffCandidates: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireDisciplinePermission: m.requireDisciplinePermission,
  isStaffAnywhere: m.isStaffAnywhere,
}));
vi.mock('#/db/disciplines', () => ({
  listDisciplines: m.listDisciplines,
  createDiscipline: m.createDiscipline,
  renameDiscipline: m.renameDiscipline,
  deleteDiscipline: m.deleteDiscipline,
}));
vi.mock('#/db/discipline-staff', () => ({
  listDisciplineStaffByOrg: m.listDisciplineStaffByOrg,
  assignDisciplineStaff: m.assignDisciplineStaff,
  removeDisciplineStaff: m.removeDisciplineStaff,
}));
vi.mock('#/db/users', () => ({
  searchStaffCandidates: m.searchStaffCandidates,
}));
// The active org is deployment configuration, not session state — pinned so
// every handler's org argument is assertable, matching personas-route.test.ts.
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 7 }));

import { getDisciplineStaffCandidatesHandler } from '../discipline-staff-candidates';
import { getDisciplinesHandler, postDisciplineHandler } from '../disciplines';
import {
  deleteDisciplineHandler,
  patchDisciplineHandler,
} from '../disciplines.$disciplineId';
import {
  deleteDisciplineStaffHandler,
  putDisciplineStaffHandler,
} from '../disciplines.$disciplineId.staff';

const ADMIN = { userId: 'admin-1', roles: ['admin'] };

function req(body?: unknown, method = 'POST', url = 'http://t/x'): Request {
  return new Request(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdmin.mockResolvedValue(ADMIN);
  m.listDisciplines.mockResolvedValue({
    disciplines: [],
    unfiledLessonCount: 0,
  });
  m.listDisciplineStaffByOrg.mockResolvedValue(new Map());
  m.createDiscipline.mockResolvedValue({
    ok: true,
    discipline: { id: 1, name: 'Aerodynamics', slug: 'aerodynamics' },
  });
  m.renameDiscipline.mockResolvedValue({
    ok: true,
    discipline: { id: 1, name: 'Aero', slug: 'aerodynamics' },
  });
  m.deleteDiscipline.mockResolvedValue({ ok: true });
  m.assignDisciplineStaff.mockResolvedValue({ ok: true });
  m.removeDisciplineStaff.mockResolvedValue({ ok: true });
  m.searchStaffCandidates.mockResolvedValue([]);
});

/**
 * Test 1. Every route refuses a non-admin — a discipline SME acting on their
 * OWN discipline included, which is the escalation this guard exists to
 * prevent.
 *
 * An SME holds no global `admin` or `owner` role, so `requireAdmin` throws for
 * them exactly as it does for a learner — that rejection IS the SME case, and
 * it is what these handlers must be built to respect. What separates the two
 * scenarios is what would have admitted an SME:
 * `requireDisciplinePermission`, which is asserted never to be reached.
 */
const CASES: [
  string,
  () => Promise<Response>,
  () => ReturnType<typeof vi.fn>,
][] = [
  [
    'GET /disciplines',
    () => getDisciplinesHandler(req(undefined, 'GET')),
    () => m.listDisciplines,
  ],
  [
    'POST /disciplines',
    () => postDisciplineHandler(req({ name: 'Aerodynamics' })),
    () => m.createDiscipline,
  ],
  [
    'PATCH /disciplines/:id',
    () => patchDisciplineHandler(req({ name: 'Aero' }, 'PATCH'), '4'),
    () => m.renameDiscipline,
  ],
  [
    'DELETE /disciplines/:id',
    () => deleteDisciplineHandler(req(undefined, 'DELETE'), '4'),
    () => m.deleteDiscipline,
  ],
  [
    'PUT /disciplines/:id/staff',
    () =>
      putDisciplineStaffHandler(
        req({ userId: 'sme-1', role: 'subject-expert' }, 'PUT'),
        '4',
      ),
    () => m.assignDisciplineStaff,
  ],
  [
    'DELETE /disciplines/:id/staff',
    () =>
      deleteDisciplineStaffHandler(
        req({ userId: 'sme-1', role: 'subject-expert' }, 'DELETE'),
        '4',
      ),
    () => m.removeDisciplineStaff,
  ],
  [
    'GET /discipline-staff-candidates',
    () =>
      getDisciplineStaffCandidatesHandler(
        req(undefined, 'GET', 'http://t/x?q=ann'),
      ),
    () => m.searchStaffCandidates,
  ],
];

describe.each(CASES)('%s — the admin floor', (_label, call, query) => {
  /**
   * Mutant seen RED: the guard swapped for `requireDisciplinePermission(...,
   * 'content', ...)`, or simply deleted. With `requireAdmin` rejecting and the
   * discipline guard resolving, the handler runs, the DB function IS called,
   * and both assertions fail.
   *
   * Asserting the DB function was never called is what makes this a refusal
   * test rather than a status-code test: a handler that assigns the role and
   * then returns 403 would pass on status alone and would still have appointed
   * the expert.
   */
  it('refuses a discipline SME acting on their own discipline, and touches no write', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());

    const res = await call();

    expect(res.status).toBe(403);
    expect(query()).not.toHaveBeenCalled();
    // The guard that WOULD have admitted them, never consulted.
    expect(m.requireDisciplinePermission).not.toHaveBeenCalled();
  });

  it('never consults discipline-scoped authority even on the happy path', async () => {
    await call();

    expect(m.requireAdmin).toHaveBeenCalledTimes(1);
    expect(m.requireDisciplinePermission).not.toHaveBeenCalled();
  });
});

/** Test 2. Granting writes the right triple, and records who granted it. */
describe('PUT /api/admin/disciplines/:id/staff', () => {
  /**
   * Mutant seen RED: `assignedBy: parsed.data.userId` — the appointee credited
   * with their own appointment. Also RED for `roleName: 'course-manager'` and
   * for a swapped `userId`/`disciplineId`.
   *
   * Asserted on the arguments the DB writer RECEIVED, not on the 204: the
   * status is identical whichever id was written.
   */
  it('assigns subject-expert on this discipline, stamped with the acting admin', async () => {
    const res = await putDisciplineStaffHandler(
      req({ userId: 'sme-1', role: 'subject-expert' }, 'PUT'),
      '4',
    );

    expect(res.status).toBe(204);
    expect(m.assignDisciplineStaff).toHaveBeenCalledWith({
      userId: 'sme-1',
      disciplineId: 4,
      roleName: 'subject-expert',
      // The org this deployment administers, from `getActiveOrgId()` — not
      // anything the caller supplied. Without it the write is unscoped and a
      // `disciplineId` from another org is just an integer.
      orgId: 7,
      assignedBy: 'admin-1',
    });
  });

  /**
   * `assignedBy` is the only record of who let someone into a discipline, so
   * it must come from the resolved SESSION and never from the request body.
   *
   * Mutant seen RED: `assignedBy: body.assignedBy ?? actor.userId` — a caller
   * could then sign the audit trail with somebody else's name.
   */
  it('ignores an assignedBy supplied by the caller', async () => {
    await putDisciplineStaffHandler(
      req(
        { userId: 'sme-1', role: 'subject-expert', assignedBy: 'someone-else' },
        'PUT',
      ),
      '4',
    );

    expect(m.assignDisciplineStaff).toHaveBeenCalledWith(
      expect.objectContaining({ assignedBy: 'admin-1' }),
    );
  });

  /**
   * Mutant seen RED: the role enum widened to `z.string()`. `owner` in a
   * `discipline_staff` row resolves to `Set(['*'])` through
   * `requireDisciplinePermission`'s role union — unconditional authority
   * through a discipline-shaped door.
   */
  it('rejects a role outside the discipline-scoped set before any write', async () => {
    const res = await putDisciplineStaffHandler(
      req({ userId: 'sme-1', role: 'owner' }, 'PUT'),
      '4',
    );

    expect(res.status).toBe(400);
    expect(m.assignDisciplineStaff).not.toHaveBeenCalled();
  });

  /**
   * The grant used to take no org at all: `disciplines.org_id` is a real column
   * and `user_profiles` has none, so any user was grantable on any discipline
   * in the database — another org's included. An id that exists NOWHERE was
   * worse: it reached the INSERT and raised an uncaught foreign-key violation,
   * i.e. a 500, which is exactly the failure this handler already refuses to
   * give for an unknown `userId`.
   *
   * Mutant seen RED: the `unknown-discipline` branch dropped, so the reason
   * falls through to the final `Role not found` 404 — same status, wrong
   * sentence — or, with the db-layer gate removed too, a 204 for a write into
   * another org.
   */
  it('404s a discipline this org does not own', async () => {
    m.assignDisciplineStaff.mockResolvedValueOnce({
      ok: false,
      reason: 'unknown-discipline',
    });

    const res = await putDisciplineStaffHandler(
      req({ userId: 'sme-1', role: 'subject-expert' }, 'PUT'),
      '999',
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Discipline not found');
  });

  it('404s an appointee the directory does not know, rather than 500ing', async () => {
    m.assignDisciplineStaff.mockResolvedValueOnce({
      ok: false,
      reason: 'unknown-user',
    });

    const res = await putDisciplineStaffHandler(
      req({ userId: 'nobody', role: 'subject-expert' }, 'PUT'),
      '4',
    );

    expect(res.status).toBe(404);
  });
});

/** Test 3. Revoking removes only that row. */
describe('DELETE /api/admin/disciplines/:id/staff', () => {
  /**
   * Mutant seen RED: `removeDisciplineStaff(body.userId, disciplineId)` with
   * the role dropped, or the discipline id taken from the body instead of the
   * path. Both compile; both revoke something other than the row asked for.
   */
  it('revokes exactly the named person, discipline and role', async () => {
    const res = await deleteDisciplineStaffHandler(
      req({ userId: 'sme-1', role: 'subject-expert' }, 'DELETE'),
      '4',
    );

    expect(res.status).toBe(204);
    expect(m.removeDisciplineStaff).toHaveBeenCalledTimes(1);
    expect(m.removeDisciplineStaff).toHaveBeenCalledWith({
      userId: 'sme-1',
      disciplineId: 4,
      roleName: 'subject-expert',
      orgId: 7,
    });
  });

  /**
   * A revocation is destructive and immediate, so an unowned id must be
   * refused rather than silently unseating another org's subject expert.
   *
   * Mutant seen RED: the result of `removeDisciplineStaff` ignored and 204
   * returned unconditionally — which is precisely what this handler did before
   * the write became org-scoped.
   */
  it('404s a discipline this org does not own', async () => {
    m.removeDisciplineStaff.mockResolvedValueOnce({
      ok: false,
      reason: 'unknown-discipline',
    });

    const res = await deleteDisciplineStaffHandler(
      req({ userId: 'sme-1', role: 'subject-expert' }, 'DELETE'),
      '999',
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Discipline not found');
  });

  it('rejects a non-numeric discipline id before touching the database', async () => {
    const res = await deleteDisciplineStaffHandler(
      req({ userId: 'sme-1', role: 'subject-expert' }, 'DELETE'),
      'abc',
    );

    expect(res.status).toBe(400);
    expect(m.removeDisciplineStaff).not.toHaveBeenCalled();
  });
});

/** Test 4. Deleting a discipline that still has lessons fails legibly. */
describe('DELETE /api/admin/disciplines/:id', () => {
  /**
   * `lessons.discipline_id` is `on delete no action`. The choice made here is
   * to REFUSE rather than reassign: silently moving an SME's lessons into the
   * admin-only "Untitled" queue would revoke their authorship of every one of
   * them as a side effect of an unrelated click.
   *
   * Mutant seen RED: `error: 'Could not delete this discipline'` — a
   * correct-shaped 409 with the count stripped out. It carries the same status
   * and the same failure, and tells the admin nothing about how much work
   * stands between them and the delete.
   */
  it('409s with the lesson count named in the message', async () => {
    m.deleteDiscipline.mockResolvedValueOnce({
      ok: false,
      reason: 'has-lessons',
      lessonCount: 12,
    });

    const res = await deleteDisciplineHandler(req(undefined, 'DELETE'), '4');
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('12 lessons');
    // The same number as data, so the screen can put it on the right row
    // without parsing English back out of the sentence.
    expect(body.lessonCount).toBe(12);
  });

  /**
   * Mutant seen RED: `${result.lessonCount} lessons` unconditionally — "1
   * lessons" on the single-lesson case, which is the one an admin hits most.
   */
  it('says "1 lesson", not "1 lessons"', async () => {
    m.deleteDiscipline.mockResolvedValueOnce({
      ok: false,
      reason: 'has-lessons',
      lessonCount: 1,
    });

    const body = await (
      await deleteDisciplineHandler(req(undefined, 'DELETE'), '4')
    ).json();

    expect(body.error).toContain('1 lesson.');
    expect(body.error).not.toContain('1 lessons');
  });

  /**
   * `countLessonsInDiscipline` is deliberately un-scoped, so before ownership
   * was resolved first this route answered a foreign-org id with a 409 naming
   * that org's exact lesson count. An id this deployment does not administer
   * must read as "not found" and disclose nothing.
   *
   * Mutant seen RED: `deleteDiscipline` counting before resolving ownership —
   * the db layer then returns `has-lessons` and this handler faithfully
   * reports 409 with the number in it.
   */
  it("404s another org's discipline instead of naming its lesson count", async () => {
    m.deleteDiscipline.mockResolvedValueOnce({
      ok: false,
      reason: 'not-found',
    });

    const res = await deleteDisciplineHandler(req(undefined, 'DELETE'), '999');
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.lessonCount).toBeUndefined();
  });

  it('deletes an empty discipline in the active org', async () => {
    const res = await deleteDisciplineHandler(req(undefined, 'DELETE'), '4');

    expect(res.status).toBe(204);
    expect(m.deleteDiscipline).toHaveBeenCalledWith(7, 4);
  });
});

/** Test 5. The listing reports the counts, unfiled lessons included. */
describe('GET /api/admin/disciplines', () => {
  /**
   * Mutant seen RED: `unfiledLessonCount` dropped from the response — the
   * admin-only triage queue becomes invisible on the only screen whose
   * audience can clear it. Also RED for a staff map looked up by array index
   * instead of discipline id.
   */
  it('returns each discipline with its lesson count and its experts, plus the unfiled count', async () => {
    m.listDisciplines.mockResolvedValueOnce({
      disciplines: [
        { id: 1, name: 'Aerodynamics', slug: 'aerodynamics', lessonCount: 12 },
        { id: 2, name: 'Navigation', slug: 'navigation', lessonCount: 0 },
      ],
      unfiledLessonCount: 5,
    });
    m.listDisciplineStaffByOrg.mockResolvedValueOnce(
      new Map([
        [
          2,
          [
            {
              userId: 'sme-1',
              email: 'a@b.c',
              firstName: 'Ann',
              lastName: null,
              roles: ['subject-expert'],
            },
          ],
        ],
      ]),
    );

    const body = await (
      await getDisciplinesHandler(req(undefined, 'GET'))
    ).json();

    expect(m.listDisciplines).toHaveBeenCalledWith(7);
    expect(m.listDisciplineStaffByOrg).toHaveBeenCalledWith(7);
    expect(body.unfiledLessonCount).toBe(5);
    expect(body.disciplines[0]).toEqual({
      id: 1,
      name: 'Aerodynamics',
      slug: 'aerodynamics',
      lessonCount: 12,
      // A discipline nobody staffs gets an empty list, not a missing key.
      staff: [],
    });
    expect(
      body.disciplines[1].staff.map((s: { userId: string }) => s.userId),
    ).toEqual(['sme-1']);
  });
});

describe('POST /api/admin/disciplines', () => {
  it('creates in the active org', async () => {
    const res = await postDisciplineHandler(req({ name: 'Aerodynamics' }));

    expect(m.createDiscipline).toHaveBeenCalledWith(7, 'Aerodynamics');
    expect(res.status).toBe(201);
  });

  it('rejects a blank name without touching the database', async () => {
    const res = await postDisciplineHandler(req({ name: '   ' }));

    expect(res.status).toBe(400);
    expect(m.createDiscipline).not.toHaveBeenCalled();
  });

  it('409s a duplicate with the field, so the input can own the error', async () => {
    m.createDiscipline.mockResolvedValueOnce({
      ok: false,
      reason: 'duplicate-name',
    });

    const res = await postDisciplineHandler(req({ name: 'Aerodynamics' }));

    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe('name');
  });
});

describe('GET /api/admin/discipline-staff-candidates', () => {
  /**
   * Mutant seen RED: the length check moved ABOVE the guard — an
   * unauthenticated caller would then learn the minimum term from a 400 before
   * being refused.
   */
  it('guards before it validates the search term', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());

    const res = await getDisciplineStaffCandidatesHandler(
      req(undefined, 'GET', 'http://t/x'),
    );

    expect(res.status).toBe(403);
  });

  it('refuses a term shorter than the minimum, and says so', async () => {
    const res = await getDisciplineStaffCandidatesHandler(
      req(undefined, 'GET', 'http://t/x?q=a'),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('at least 2 characters');
    expect(m.searchStaffCandidates).not.toHaveBeenCalled();
  });

  it('searches on the trimmed term', async () => {
    await getDisciplineStaffCandidatesHandler(
      req(undefined, 'GET', 'http://t/x?q=%20ann%20'),
    );

    expect(m.searchStaffCandidates).toHaveBeenCalledWith('ann');
  });
});
