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
  m.getCourseIdForModuleId.mockResolvedValue(3);
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
    const res = await postLessonHandler(postReq({ lessonId: 9 }), '40');
    expect(res.status).toBe(404);
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

  it('resolves the course from the module id before guarding', async () => {
    m.getCourseIdForModuleId.mockResolvedValueOnce(null);
    m.absentResourceResponse.mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    const res = await deletePlacementHandler(deleteReq(), '999', '9');
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.unlinkLesson).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
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
    m.getCourseIdForModuleId.mockResolvedValueOnce(null);
    m.absentResourceResponse.mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    const res = await patchPlacementHandler(
      patchReq({ targetModuleId: 41, prevLessonId: null, nextLessonId: null }),
      '999',
      '9',
    );
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });
});
