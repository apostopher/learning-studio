// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /api/admin/disciplines/:id/lessons` — the library column's "add
 * lesson".
 *
 * Admitted: an ADMIN, or THIS discipline's Subject Expert. Nobody else — not
 * a course manager, not a staffer on some other discipline.
 *
 * Both halves are enforced by ONE call here, `requireLessonContentPermission`,
 * because the admin half lives inside the guard itself (RBAC rule 3, the admin
 * bypass in `requireScopedPermission` — its own tests are in
 * `require-lesson-content-permission.test.ts`). What this file pins is that
 * the route delegates to that guard, scoped to THIS discipline, and never
 * hand-rolls the rule locally: an earlier revision unioned `requireAdmin` in
 * by hand, which is now a second copy of a policy the chokepoint owns.
 *
 * `requireAdmin` is therefore asserted UNCALLED — not because admins are
 * refused (they are not), but because a route reaching for the org-level guard
 * on a lesson that HAS a discipline is the exact shape of the reverted
 * d4f767d incident, which took authorship away from every SME.
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
    requireLessonContentPermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    findDisciplineInOrg: vi.fn(),
    renameDiscipline: vi.fn(),
    deleteDiscipline: vi.fn(),
    createLibraryLesson: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireLessonContentPermission: m.requireLessonContentPermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/db/disciplines', () => ({
  findDisciplineInOrg: m.findDisciplineInOrg,
  renameDiscipline: m.renameDiscipline,
  deleteDiscipline: m.deleteDiscipline,
}));
vi.mock('#/db/library-lessons', () => ({
  createLibraryLesson: m.createLibraryLesson,
}));
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 7 }));

import { postDisciplineLessonHandler } from '../disciplines.$disciplineId.lessons';

const CARD = {
  id: 91,
  name: 'Stalls',
  slug: 'stalls',
  isConfigured: false,
  isAvailable: false,
  courseCount: 0,
};

function post(body: unknown): Request {
  return new Request('http://t/api/admin/disciplines/4/lessons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.findDisciplineInOrg.mockResolvedValue({ id: 4 });
  m.requireAdmin.mockResolvedValue(undefined);
  m.requireLessonContentPermission.mockResolvedValue(undefined);
  m.createLibraryLesson.mockResolvedValue(CARD);
  m.absentResourceResponse.mockResolvedValue(
    Response.json({ error: 'Discipline not found' }, { status: 404 }),
  );
});

describe('postDisciplineLessonHandler', () => {
  it('creates the lesson under the requested discipline and the active org', async () => {
    const res = await postDisciplineLessonHandler(
      post({ name: 'Stalls' }),
      '4',
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual(CARD);
    // Assert on what the writer RECEIVED, not merely that a 201 came back: a
    // handler that dropped `disciplineId` (filing every library lesson under
    // no discipline at all) would still answer 201 with a plausible card.
    expect(m.createLibraryLesson.mock.calls).toEqual([
      [{ orgId: 7, disciplineId: 4, name: 'Stalls' }],
    ]);
  });

  it('delegates to the lesson-content guard, scoped to THIS discipline', async () => {
    await postDisciplineLessonHandler(post({ name: 'Stalls' }), '4');

    // Mutant this catches: scoping the check to the wrong id. An expert on
    // discipline 9 would then be able to write into discipline 4, and the
    // 201 test above would still pass.
    expect(m.requireLessonContentPermission.mock.calls).toEqual([
      [expect.any(Headers), 4, 'create'],
    ]);
    // Mutant this catches: re-adding a local `requireAdmin` union. Admins are
    // admitted — by the guard's own bypass — so this asserts WHERE the rule
    // lives, not who it admits. Two copies of an authorization rule is one
    // copy that gets tightened and one that does not.
    expect(m.requireAdmin).not.toHaveBeenCalled();
  });

  it('refuses when the guard refuses, and writes nothing', async () => {
    m.requireLessonContentPermission.mockRejectedValue(new m.ForbiddenError());

    const res = await postDisciplineLessonHandler(
      post({ name: 'Stalls' }),
      '4',
    );

    expect(res.status).toBe(403);
    expect(m.createLibraryLesson).not.toHaveBeenCalled();
  });

  it('refuses a discipline this org does not own, without writing or guarding', async () => {
    m.findDisciplineInOrg.mockResolvedValue(null);

    const res = await postDisciplineLessonHandler(
      post({ name: 'Stalls' }),
      '4',
    );

    expect(res.status).toBe(404);
    // Mutant this catches: checking ownership AFTER the write, or not at all.
    // `disciplines.id` is a global serial, so without this a staffer in one
    // org could file lessons into another tenant's discipline.
    expect(m.createLibraryLesson).not.toHaveBeenCalled();
    // Mutant this catches: guarding before the ownership check. The guard
    // must never run against an id this org does not own — it would be asked
    // about a foreign discipline, where a stranger's `discipline_staff` row
    // could answer yes.
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
  });

  it('routes the absent discipline through absentResourceResponse, not a bare 404', async () => {
    m.findDisciplineInOrg.mockResolvedValue(null);
    m.absentResourceResponse.mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );

    const res = await postDisciplineLessonHandler(
      post({ name: 'Stalls' }),
      '4',
    );

    // Mutant this catches: `return Response.json({error}, {status: 404})`
    // inline. That reads identically to a staffer and turns the endpoint into
    // an id oracle for everyone else — 404 means "exists elsewhere", 403 means
    // "does not exist here".
    expect(res.status).toBe(403);
    expect(m.absentResourceResponse).toHaveBeenCalledTimes(1);
  });

  it('lets a non-Forbidden failure escape rather than reporting it as a refusal', async () => {
    m.requireLessonContentPermission.mockRejectedValue(new Error('db down'));

    // Mutant this catches: a bare `catch { return 403 }`, which would report
    // an outage as an authorization decision and hide it from the error
    // reporter.
    await expect(
      postDisciplineLessonHandler(post({ name: 'Stalls' }), '4'),
    ).rejects.toThrow('db down');
    expect(m.createLibraryLesson).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric discipline id before looking anything up', async () => {
    const res = await postDisciplineLessonHandler(
      post({ name: 'Stalls' }),
      'abc',
    );

    expect(res.status).toBe(400);
    expect(m.findDisciplineInOrg).not.toHaveBeenCalled();
  });

  it('rejects a body carrying fields the schema does not allow', async () => {
    // Mutant this catches: dropping `.strict()`. A caller could then send
    // `{ name, disciplineId: 99 }` or `{ name, orgId: 1 }` and have it
    // silently ignored — which is fine today and a privilege bug the moment
    // a future edit spreads the parsed body into the insert.
    const res = await postDisciplineLessonHandler(
      post({ name: 'Stalls', orgId: 1 }),
      '4',
    );

    expect(res.status).toBe(400);
    expect(m.createLibraryLesson).not.toHaveBeenCalled();
  });

  it('rejects an empty name', async () => {
    const res = await postDisciplineLessonHandler(post({ name: '   ' }), '4');

    expect(res.status).toBe(400);
    expect(m.createLibraryLesson).not.toHaveBeenCalled();
  });
});
