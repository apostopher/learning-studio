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
    requireLessonContentPermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    getCourseIdForLessonId: vi.fn(),
    getCourseIdForModuleId: vi.fn(),
    getDisciplineIdForLessonId: vi.fn(),
    deleteLesson: vi.fn(),
    moveLesson: vi.fn(),
    updateLessonConfig: vi.fn(),
    updateLessonDependencies: vi.fn(),
    updateLessonName: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
  requireLessonContentPermission: m.requireLessonContentPermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForLessonId: m.getCourseIdForLessonId,
  getCourseIdForModuleId: m.getCourseIdForModuleId,
  getDisciplineIdForLessonId: m.getDisciplineIdForLessonId,
}));
vi.mock('#/db/admin', () => ({
  deleteLesson: m.deleteLesson,
  moveLesson: m.moveLesson,
  updateLessonConfig: m.updateLessonConfig,
  updateLessonDependencies: m.updateLessonDependencies,
  updateLessonName: m.updateLessonName,
}));

import { deleteLessonHandler, patchLessonHandler } from '../lessons.$lessonId';

function req(body: unknown): Request {
  return new Request('http://test/api/admin/lessons/10', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: several tests below chain
  // .mockResolvedValueOnce()/.mockRejectedValueOnce() on the guards, and
  // clearAllMocks leaves an unconsumed queued "once" sitting on the mock for
  // the next test to accidentally inherit.
  vi.resetAllMocks();
  // Lowest-id course this lesson happens to also be in — deliberately
  // DIFFERENT from any course used as a guard target below, so a branch that
  // regresses to guarding on this value (instead of the target module's
  // course) fails loudly rather than by coincidence.
  m.getCourseIdForLessonId.mockResolvedValue(3);
  m.getCourseIdForModuleId.mockResolvedValue(7);
  // This lesson's discipline — a sentinel distinct from every course id used
  // anywhere in this file, so a branch that regresses to guarding on a course
  // id instead of the resolved discipline id fails a `toHaveBeenCalledWith`
  // rather than passing by coincidence.
  m.getDisciplineIdForLessonId.mockResolvedValue({
    found: true,
    disciplineId: 42,
  });
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.requireLessonContentPermission.mockResolvedValue(undefined);
  // Stands in for the real helper (unit-tested in
  // lib/__tests__/permissions-server.test.ts): it answers 404 to someone on
  // the teaching side and a flat 403 to everyone else, so a missing row
  // cannot be used to enumerate ids.
  m.absentResourceResponse.mockResolvedValue(
    new Response(null, { status: 404 }),
  );
  // Default to a successful write so a permission bug that lets a body
  // through shows up as "the write happened" (200), not as an incidental
  // 404 from an unmocked falsy return.
  m.updateLessonConfig.mockResolvedValue({ id: 10 });
  m.updateLessonName.mockResolvedValue({ id: 10, name: 'Renamed' });
  m.moveLesson.mockResolvedValue({ id: 10, rank: 1, moduleId: 3 });
  m.deleteLesson.mockResolvedValue(true);
});

/**
 * The enumeration oracle. These handlers resolve the row BEFORE guarding, so
 * an unauthenticated caller could walk sequential integer ids and read the id
 * space straight off the status code — 404 absent, 403 present. The absent
 * branch is delegated to `absentResourceResponse`, which answers 404 only to
 * someone on the teaching side; the real behaviour is unit-tested in
 * lib/__tests__/permissions-server.test.ts.
 */
describe('patchLessonHandler / deleteLessonHandler — absent lesson', () => {
  it('hands the absent PATCH lesson to absentResourceResponse, not a bare 404', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    const request = req({ courseId: 1, dependsOn: [] });

    await patchLessonHandler(request, '999');

    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Lesson not found',
    );
  });

  it('returns what that helper answered — a stranger gets 403, not 404', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    m.absentResourceResponse.mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );

    const res = await patchLessonHandler(
      req({ courseId: 1, dependsOn: [] }),
      '999',
    );

    expect(res.status).toBe(403);
  });

  it('hands the absent DELETE lesson to it too, and returns its answer', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    m.absentResourceResponse.mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );
    const request = req({});

    const res = await deleteLessonHandler(request, '999');

    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Lesson not found',
    );
    expect(res.status).toBe(403);
    expect(m.deleteLesson).not.toHaveBeenCalled();
  });
});

describe('patchLessonHandler — course resolution', () => {
  it('404s a lesson that does not exist, before guarding or parsing', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    const res = await patchLessonHandler(
      req({ courseId: 1, dependsOn: [] }),
      '999',
    );
    expect(res.status).toBe(404);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
  });

  it('400s an invalid lesson id without resolving a course', async () => {
    const res = await patchLessonHandler(
      req({ courseId: 1, dependsOn: [] }),
      'abc',
    );
    expect(res.status).toBe(400);
    expect(m.getCourseIdForLessonId).not.toHaveBeenCalled();
  });
});

// Requirement 7: `dependencies` still guards course-scoped on the
// client-supplied `courseId`, pinned so this task cannot silently widen it
// to the discipline/admin content guard — a placement's prerequisite list
// affects only that one course.
describe('patchLessonHandler — dependencies (still course-scoped, unchanged)', () => {
  it('guards and writes against the courseId the client sent, not the lesson-resolved one', async () => {
    m.updateLessonDependencies.mockResolvedValue({ ok: true, dependsOn: [] });
    await patchLessonHandler(req({ courseId: 7, dependsOn: ['a'] }), '10');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'structure',
      'update',
    );
    expect(m.updateLessonDependencies).toHaveBeenCalledWith(10, 7, ['a']);
    // Never escalated to the discipline/admin content guard.
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
  });

  it('403s a refused actor without writing dependencies', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchLessonHandler(
      req({ courseId: 7, dependsOn: ['a'] }),
      '10',
    );
    expect(res.status).toBe(403);
    expect(m.updateLessonDependencies).not.toHaveBeenCalled();
  });
});

// Requirements 1/2/3: rename's authority follows the lesson's DISCIPLINE, not
// any one course's `structure`, and NOT an unconditional org admin (the
// reverted d4f767d policy). The discipline/admin split itself is exercised at
// the permission layer (lib/__tests__/require-lesson-content-permission.test.ts,
// require-discipline-permission.test.ts); these tests pin the ROUTE's wiring
// into that guard.
describe('patchLessonHandler — rename (discipline-owned content)', () => {
  it('resolves the lesson’s discipline and forwards it, and the right action, to the content guard', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValue({
      found: true,
      disciplineId: 7,
    });

    const res = await patchLessonHandler(req({ name: 'Renamed' }), '10');

    expect(res.status).toBe(200);
    expect(m.getDisciplineIdForLessonId).toHaveBeenCalledWith(10);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'update',
    );
    expect(m.updateLessonName).toHaveBeenCalledWith(10, 'Renamed');
  });

  // Test 1: an SME on this lesson's own discipline (7) is admitted — proven
  // above by the 200 plus the exact `(headers, 7, 'update')` call. A mutant
  // that resolves the WRONG discipline (e.g. hardcodes a different id, or
  // reads a course id instead) fails the `toHaveBeenCalledWith` assertion
  // even though the write still "succeeds" — RED, not a crash.

  // Test 2 (mutant: `guardContent` swallows the guard's rejection and
  // proceeds anyway — e.g. drops the `try`, or ignores the caught error
  // instead of returning 403). Refusing the mocked guard must still stop the
  // write — RED if it doesn't.
  it('refuses when the content guard rejects: 403, updateLessonName not called', async () => {
    m.requireLessonContentPermission.mockRejectedValueOnce(
      new m.ForbiddenError(),
    );
    const res = await patchLessonHandler(req({ name: 'Renamed' }), '10');
    expect(res.status).toBe(403);
    expect(m.updateLessonName).not.toHaveBeenCalled();
  });

  // Test 3, named mutant: rename reverts to d4f767d's `guardAdmin` — calling
  // `requireAdmin` unconditionally instead of routing through
  // `requireLessonContentPermission`. Under that mutant this assertion is
  // never satisfied (the content guard is simply never invoked), so this is
  // RED against exactly the reverted policy — an org admin with no
  // discipline row would otherwise pass unconditionally, which is pinned
  // directly (mocking to reject, not merely "unauthorized by default") at
  // the permission layer in
  // require-lesson-content-permission.test.ts: "refuses an org admin who
  // holds no discipline SME row".
  it('always routes rename through the lesson-content guard, never the course structure guard', async () => {
    await patchLessonHandler(req({ name: 'Renamed' }), '10');
    expect(m.requireLessonContentPermission).toHaveBeenCalled();
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  // Test 4 (route half): an "Untitled" lesson (no discipline) forwards
  // `null`, not some other sentinel, to the guard — the null branch itself
  // (admin admitted, SME refused) is pinned at the permission layer.
  it('forwards a null discipline ("Untitled") through untouched', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValue({
      found: true,
      disciplineId: null,
    });

    const res = await patchLessonHandler(req({ name: 'Renamed' }), '10');

    expect(res.status).toBe(200);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      null,
      'update',
    );
  });
});

// Requirement 3 continued: config is discipline-owned content too (every
// field is a column on the lesson row, written by lessonId alone — see
// `updateLessonConfig`).
describe('patchLessonHandler — config (discipline-owned content)', () => {
  it('resolves the lesson’s discipline and forwards it to the content guard', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValue({
      found: true,
      disciplineId: 7,
    });

    const res = await patchLessonHandler(req({ levels: ['basic'] }), '10');

    expect(res.status).toBe(200);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'update',
    );
    expect(m.updateLessonConfig).toHaveBeenCalledWith(10, {
      levels: ['basic'],
    });
  });

  // Mutant: config still calls the old field-split guard (`requireCoursePermission`
  // on 'structure'/'content') instead of the lesson-content guard. Refusing
  // only `requireLessonContentPermission` would then not stop the write — RED.
  it('refuses when the content guard rejects: 403, updateLessonConfig not called', async () => {
    m.requireLessonContentPermission.mockRejectedValueOnce(
      new m.ForbiddenError(),
    );
    const res = await patchLessonHandler(req({ levels: ['basic'] }), '10');
    expect(res.status).toBe(403);
    expect(m.updateLessonConfig).not.toHaveBeenCalled();
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('404s when the config write target has vanished', async () => {
    m.updateLessonConfig.mockResolvedValue(null);
    const res = await patchLessonHandler(req({ levels: ['basic'] }), '10');
    expect(res.status).toBe(404);
  });
});

// Requirements 4/5: move guards on the TARGET module's course — not the
// lesson's lowest-id course, and not the lesson's discipline.
describe('patchLessonHandler — move (guards the target module’s course)', () => {
  function moveReq() {
    return req({ targetModuleId: 55, prevLessonId: null, nextLessonId: null });
  }

  // Requirement 4, named mutant: guard the lesson's lowest course
  // (`getCourseIdForLessonId` → 3) instead of the target module's course
  // (`getCourseIdForModuleId(55)` → 7). `beforeEach` deliberately makes these
  // two (and the lesson's discipline, 42) all differ, so a mutant that guards
  // on any of the other two fails this `toHaveBeenCalledWith` assertion for 7
  // — RED, not a crash (all three are valid ids).
  it('guards on the TARGET module’s course, not the lesson’s lowest course or its discipline', async () => {
    await patchLessonHandler(moveReq(), '10');
    expect(m.getCourseIdForModuleId).toHaveBeenCalledWith(55);
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'structure',
      'update',
    );
    expect(m.requireCoursePermission).not.toHaveBeenCalledWith(
      expect.anything(),
      3,
      'structure',
      'update',
    );
    // Requirement 7: never escalated to the discipline/admin content guard.
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
    expect(m.moveLesson).toHaveBeenCalledWith({
      lessonId: 10,
      targetModuleId: 55,
      prevLessonId: null,
      nextLessonId: null,
    });
  });

  it('403s a refused actor on the target course without moving', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchLessonHandler(moveReq(), '10');
    expect(res.status).toBe(403);
    expect(m.moveLesson).not.toHaveBeenCalled();
  });

  // Requirement 5, named mutant: skip the null check on
  // `getCourseIdForModuleId` and guard on the lesson's lowest course as a
  // fallback instead of 404ing. That mutant would call
  // `requireCoursePermission` (RED: not called here) and would call
  // `moveLesson` (RED: called here) instead of 404ing.
  it('404s when the target module does not exist, and never calls moveLesson', async () => {
    m.getCourseIdForModuleId.mockResolvedValue(null);
    m.absentResourceResponse.mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    const res = await patchLessonHandler(moveReq(), '10');

    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      expect.anything(),
      'Target module not found',
    );
    expect(res.status).toBe(404);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.moveLesson).not.toHaveBeenCalled();
  });
});

describe('deleteLessonHandler — discipline-owned (deletes from every course)', () => {
  it('resolves the lesson’s discipline and forwards it to the content guard with a delete action', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValue({
      found: true,
      disciplineId: 7,
    });

    const res = await deleteLessonHandler(new Request('http://test/x'), '10');

    expect(res.status).toBe(204);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'delete',
    );
    expect(m.deleteLesson).toHaveBeenCalledWith(10);
  });

  // Mutant: delete still calls the old `guardStructure(request, courseId,
  // 'delete')` instead of the lesson-content guard. Refusing only
  // `requireLessonContentPermission` would then not stop the delete — RED.
  it('refuses when the content guard rejects: 403, deleteLesson not called', async () => {
    m.requireLessonContentPermission.mockRejectedValueOnce(
      new m.ForbiddenError(),
    );
    const res = await deleteLessonHandler(new Request('http://test/x'), '10');
    expect(res.status).toBe(403);
    expect(m.deleteLesson).not.toHaveBeenCalled();
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('404s a lesson that does not exist, before guarding', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    const res = await deleteLessonHandler(new Request('http://test/x'), '999');
    expect(res.status).toBe(404);
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
    expect(m.deleteLesson).not.toHaveBeenCalled();
  });
});

// Requirement 5: a non-existent lesson still 404s (not 403) on every branch —
// pinned across the full set of PATCH bodies plus DELETE, so no branch's
// authorization change can accidentally reorder the existence check after
// the guard, and no branch resolves a discipline for a lesson that was never
// confirmed to exist.
describe('non-existent lesson 404s (not 403) on every branch', () => {
  const CASES: [string, () => Promise<Response>][] = [
    [
      'dependencies',
      () => patchLessonHandler(req({ courseId: 1, dependsOn: [] }), '999'),
    ],
    ['rename', () => patchLessonHandler(req({ name: 'x' }), '999')],
    [
      'move',
      () =>
        patchLessonHandler(
          req({ targetModuleId: 55, prevLessonId: null, nextLessonId: null }),
          '999',
        ),
    ],
    ['config', () => patchLessonHandler(req({ levels: ['basic'] }), '999')],
    ['delete', () => deleteLessonHandler(new Request('http://test/x'), '999')],
  ];

  it.each(
    CASES,
  )('%s: 404, not 403, for a missing lesson, and resolves no discipline', async (_label, call) => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    // Even an actor who would otherwise be denied must see a 404 here, not a
    // 403 — the existence check runs before any guard.
    m.requireLessonContentPermission.mockRejectedValue(new m.ForbiddenError());
    m.requireCoursePermission.mockRejectedValue(new m.ForbiddenError());

    const res = await call();

    expect(res.status).toBe(404);
    // The top-of-handler existence check short-circuits before any branch
    // gets far enough to resolve a discipline for this lessonId.
    expect(m.getDisciplineIdForLessonId).not.toHaveBeenCalled();
  });
});
