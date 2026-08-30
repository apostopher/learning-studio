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
    absentResourceResponse: vi.fn(),
    getCourseIdForModuleId: vi.fn(),
    createLesson: vi.fn(),
    linkLesson: vi.fn(),
    unlinkLesson: vi.fn(),
    movePlacement: vi.fn(),
    deleteLesson: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: m.getCourseIdForModuleId,
}));
vi.mock('#/db/admin', () => ({
  createLesson: m.createLesson,
  deleteLesson: m.deleteLesson,
}));
vi.mock('#/db/placements', () => ({
  linkLesson: m.linkLesson,
  unlinkLesson: m.unlinkLesson,
  movePlacement: m.movePlacement,
}));

import { postLessonHandler } from '../modules.$moduleId.lessons';
import {
  deletePlacementHandler,
  patchPlacementHandler,
} from '../modules.$moduleId.lessons.$lessonId';

function postReq(body: unknown): Request {
  return new Request('http://test/api/admin/modules/40/lessons', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(): Request {
  return new Request('http://test/api/admin/modules/40/lessons/9', {
    method: 'DELETE',
  });
}

function patchReq(body: unknown): Request {
  return new Request('http://test/api/admin/modules/40/lessons/9', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const PLACEMENT = {
  id: 1,
  moduleId: 40,
  lessonId: 9,
  rank: 1,
  dependsOn: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // Module 40 and module 41 both belong to course 3 (the ordinary case:
  // moving a lesson between two modules of the SAME course). Module 77
  // belongs to course 7 — a DIFFERENT course, used by the cross-course PATCH
  // test below. Module 999 doesn't resolve at all. A single shared course id
  // for every module (the fixture this replaced) made module 40 and module
  // 41 indistinguishable, so a guard on the wrong one of the two could never
  // fail a test — see Critical 2 in the round-1 review.
  m.getCourseIdForModuleId.mockImplementation(async (id: number) => {
    if (id === 999) return null;
    if (id === 77) return 7;
    return 3;
  });
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.absentResourceResponse.mockResolvedValue(
    new Response('Forbidden', { status: 403 }),
  );
  m.linkLesson.mockResolvedValue(PLACEMENT);
  m.createLesson.mockResolvedValue({ id: 5, name: 'x' });
  m.unlinkLesson.mockResolvedValue(true);
  m.movePlacement.mockResolvedValue(PLACEMENT);
});

describe('POST /api/admin/modules/:moduleId/lessons — linking', () => {
  it('links an existing lesson when given lessonId, and does not create', async () => {
    const res = await postLessonHandler(postReq({ lessonId: 9 }), '40');
    expect(m.linkLesson).toHaveBeenCalledWith({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });
    expect(m.createLesson).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('still creates a new lesson when given name, and does not link', async () => {
    m.createLesson.mockResolvedValueOnce({ id: 5, name: 'Intro' });
    await postLessonHandler(postReq({ name: 'Intro' }), '40');
    expect(m.createLesson).toHaveBeenCalledWith({
      moduleId: 40,
      name: 'Intro',
    });
    expect(m.linkLesson).not.toHaveBeenCalled();
  });

  // Mutant this kills: an addModuleLessonInputSchema that makes both `name`
  // and `lessonId` optional on one object — that shape would happily parse
  // `{}` as valid, and this assertion would then fail because the handler
  // would proceed to call one of the two mutations instead of 400ing.
  it('rejects an empty body rather than defaulting to either branch', async () => {
    const res = await postLessonHandler(postReq({}), '40');
    expect(res.status).toBe(400);
    expect(m.linkLesson).not.toHaveBeenCalled();
    expect(m.createLesson).not.toHaveBeenCalled();
  });

  // Round-1 review (Important 4): pins `.strict()` on BOTH union branches.
  // Without it, `{ name, lessonId }` would parse as the `name` branch (the
  // first alternative z.union tries) and silently create a new lesson while
  // discarding the caller's `lessonId` — the empty-body test above cannot
  // catch this, since `{}` still fails both branches either way.
  it('rejects a body carrying BOTH name and lessonId, rather than picking one', async () => {
    const res = await postLessonHandler(
      postReq({ name: 'Intro', lessonId: 9 }),
      '40',
    );
    expect(res.status).toBe(400);
    expect(m.createLesson).not.toHaveBeenCalled();
    expect(m.linkLesson).not.toHaveBeenCalled();
  });

  // Mutant this kills: collapsing `'duplicate'` and `null` into a single
  // "falsy means 409" check — that would answer 409 for a dangling module id
  // too, which is a lie ("already in this course" when there is no course).
  it('answers 409 with a reason when the course already teaches it', async () => {
    m.linkLesson.mockResolvedValueOnce('duplicate');
    const res = await postLessonHandler(postReq({ lessonId: 9 }), '40');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining('already'),
    });
  });

  it('404s (via absentResourceResponse) when linkLesson finds no such module', async () => {
    m.linkLesson.mockResolvedValueOnce(null);
    m.absentResourceResponse.mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    const req = postReq({ lessonId: 9 });
    const res = await postLessonHandler(req, '40');
    expect(res.status).toBe(404);
    // Not just the status: a bare `new Response(null, {status: 404})` in
    // place of `absentResourceResponse` would pass a status-only check too,
    // reopening the id-enumeration oracle that helper exists to close.
    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      req.headers,
      'Module not found',
    );
  });

  it('refuses without structure:create on the target course, and never links', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postLessonHandler(postReq({ lessonId: 9 }), '40');
    expect(res.status).toBe(403);
    expect(m.linkLesson).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/modules/:moduleId/lessons/:lessonId', () => {
  it('unlinks the placement scoped to (moduleId, lessonId)', async () => {
    const res = await deletePlacementHandler(deleteReq(), '40', '9');
    expect(m.unlinkLesson).toHaveBeenCalledWith(40, 9);
    expect(res.status).toBe(204);
  });

  // Mutant this kills: calling `deleteLesson(lessonId)` instead of (or in
  // addition to) `unlinkLesson` — a lesson taught by several courses would
  // vanish from all of them the moment one course removed it from a module.
  it('never deletes the lesson itself', async () => {
    await deletePlacementHandler(deleteReq(), '40', '9');
    expect(m.deleteLesson).not.toHaveBeenCalled();
  });

  it('404s when there is no such placement to unlink', async () => {
    m.unlinkLesson.mockResolvedValueOnce(false);
    const res = await deletePlacementHandler(deleteReq(), '40', '9');
    expect(res.status).toBe(404);
  });

  // Round-1 review (Minor 8): POST already has this test; DELETE didn't.
  it('400s an invalid module or lesson id without resolving a course', async () => {
    const res = await deletePlacementHandler(deleteReq(), 'abc', '9');
    expect(res.status).toBe(400);
    expect(m.getCourseIdForModuleId).not.toHaveBeenCalled();
    const res2 = await deletePlacementHandler(deleteReq(), '40', 'xyz');
    expect(res2.status).toBe(400);
  });

  it('resolves the course from the module id before guarding', async () => {
    m.absentResourceResponse.mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    const req = deleteReq();
    const res = await deletePlacementHandler(req, '999', '9');
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.unlinkLesson).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      req.headers,
      'Module not found',
    );
  });

  it('asks for structure:delete scoped to the module’s course', async () => {
    await deletePlacementHandler(deleteReq(), '40', '9');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      3,
      'structure',
      'delete',
    );
  });

  it('refuses without structure:delete on the course, and never unlinks', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await deletePlacementHandler(deleteReq(), '40', '9');
    expect(res.status).toBe(403);
    expect(m.unlinkLesson).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/modules/:moduleId/lessons/:lessonId', () => {
  it('asks for structure:update scoped to the module’s course', async () => {
    await patchPlacementHandler(
      patchReq({ targetModuleId: 41, prevLessonId: 3, nextLessonId: null }),
      '40',
      '9',
    );
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      3,
      'structure',
      'update',
    );
  });

  it('moves the placement with the parsed body', async () => {
    const res = await patchPlacementHandler(
      patchReq({ targetModuleId: 41, prevLessonId: 3, nextLessonId: null }),
      '40',
      '9',
    );
    expect(m.movePlacement).toHaveBeenCalledWith({
      lessonId: 9,
      targetModuleId: 41,
      prevLessonId: 3,
      nextLessonId: null,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PLACEMENT);
  });

  it('404s when movePlacement finds nothing to move', async () => {
    m.movePlacement.mockResolvedValueOnce(null);
    const res = await patchPlacementHandler(
      patchReq({ targetModuleId: 41, prevLessonId: null, nextLessonId: null }),
      '40',
      '9',
    );
    expect(res.status).toBe(404);
  });

  it('400s a body missing targetModuleId, without moving anything', async () => {
    const res = await patchPlacementHandler(
      patchReq({ prevLessonId: null, nextLessonId: null }),
      '40',
      '9',
    );
    expect(res.status).toBe(400);
    expect(m.movePlacement).not.toHaveBeenCalled();
  });

  // Round-1 review (Minor 8).
  it('400s an invalid module or lesson id without resolving a course', async () => {
    const res = await patchPlacementHandler(
      patchReq({ targetModuleId: 41, prevLessonId: null, nextLessonId: null }),
      'abc',
      '9',
    );
    expect(res.status).toBe(400);
    expect(m.getCourseIdForModuleId).not.toHaveBeenCalled();
  });

  // Round-1 review, Critical 1: the guard used to check `courseId` (the URL's
  // module — course 3) and stop there, while `movePlacement` writes whatever
  // course `targetModuleId` resolves to. Module 77 (from the fixture above)
  // belongs to course 7, a DIFFERENT course than module 40's course 3 — an
  // SME holding `structure:update` on course 3 only must not be able to
  // relocate course 7's placement by pointing `targetModuleId` at one of
  // its modules. Verified RED against the pre-fix handler (see task-9-report
  // for the exact revert-and-rerun): with the old `guard(request, courseId,
  // 'update')` check alone, this request passed the guard (course 3, which
  // the actor holds) and called `movePlacement` with `targetModuleId: 77`
  // regardless — this assertion is what would have caught it.
  it('refuses a target module in a DIFFERENT course than the URL module, and never moves', async () => {
    m.absentResourceResponse.mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    const req = patchReq({
      targetModuleId: 77,
      prevLessonId: null,
      nextLessonId: null,
    });
    const res = await patchPlacementHandler(req, '40', '9');
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.movePlacement).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      req.headers,
      'Target module not found',
    );
  });

  it('refuses without structure:update on the course, and never moves', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchPlacementHandler(
      patchReq({ targetModuleId: 41, prevLessonId: null, nextLessonId: null }),
      '40',
      '9',
    );
    expect(res.status).toBe(403);
    expect(m.movePlacement).not.toHaveBeenCalled();
  });

  it('resolves the course from the module id before guarding', async () => {
    m.absentResourceResponse.mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    const req = patchReq({
      targetModuleId: 41,
      prevLessonId: null,
      nextLessonId: null,
    });
    const res = await patchPlacementHandler(req, '999', '9');
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      req.headers,
      'Module not found',
    );
  });
});
