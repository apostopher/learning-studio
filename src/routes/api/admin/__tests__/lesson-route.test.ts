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
    getCourseIdForLessonId: vi.fn(),
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
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForLessonId: m.getCourseIdForLessonId,
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
  // .mockResolvedValueOnce()/.mockRejectedValueOnce() on
  // requireCoursePermission, and clearAllMocks leaves an unconsumed queued
  // "once" sitting on the mock for the next test to accidentally inherit.
  vi.resetAllMocks();
  m.getCourseIdForLessonId.mockResolvedValue(42);
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  // Default to a successful write so a permission bug that lets a body
  // through shows up as "the write happened" (200), not as an incidental
  // 404 from an unmocked falsy return.
  m.updateLessonConfig.mockResolvedValue({ id: 10 });
});

describe('patchLessonHandler — course resolution', () => {
  it('404s a lesson that does not exist, before guarding or parsing', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    const res = await patchLessonHandler(req({ dependsOn: [] }), '999');
    expect(res.status).toBe(404);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('400s an invalid lesson id without resolving a course', async () => {
    const res = await patchLessonHandler(req({ dependsOn: [] }), 'abc');
    expect(res.status).toBe(400);
    expect(m.getCourseIdForLessonId).not.toHaveBeenCalled();
  });
});

describe('patchLessonHandler — dependencies / rename / move (structure)', () => {
  it('asks for structure:update for a dependency edit', async () => {
    m.updateLessonDependencies.mockResolvedValue({ ok: true, dependsOn: [] });
    await patchLessonHandler(req({ dependsOn: ['a'] }), '10');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'update',
    );
  });

  it('403s a refused actor without writing dependencies', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchLessonHandler(req({ dependsOn: ['a'] }), '10');
    expect(res.status).toBe(403);
    expect(m.updateLessonDependencies).not.toHaveBeenCalled();
  });

  it('asks for structure:update for a rename', async () => {
    m.updateLessonName.mockResolvedValue({ id: 10, name: 'Renamed' });
    await patchLessonHandler(req({ name: 'Renamed' }), '10');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'update',
    );
    expect(m.updateLessonName).toHaveBeenCalledWith(10, 'Renamed');
  });

  it('403s a refused rename without writing', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchLessonHandler(req({ name: 'Renamed' }), '10');
    expect(res.status).toBe(403);
    expect(m.updateLessonName).not.toHaveBeenCalled();
  });

  it('asks for structure:update for a move', async () => {
    m.moveLesson.mockResolvedValue({ id: 10 });
    await patchLessonHandler(
      req({ targetModuleId: 3, prevLessonId: null, nextLessonId: null }),
      '10',
    );
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'update',
    );
  });

  it('403s a refused move without writing', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchLessonHandler(
      req({ targetModuleId: 3, prevLessonId: null, nextLessonId: null }),
      '10',
    );
    expect(res.status).toBe(403);
    expect(m.moveLesson).not.toHaveBeenCalled();
  });
});

describe('patchLessonHandler — config branch, every field lands in its entity', () => {
  // Table-driven over ALL FIVE fields the config schema carries, not just the
  // two ('levels', 'hasDebrief') the other tests happen to exercise. This is
  // what actually closes the hole a hand-maintained field list leaves open:
  // 'isAvailable', 'requiredSubscriptions' and 'needsVideoWatch' were
  // previously untested and could each be moved to the wrong group (or land
  // in neither) with a green suite.
  const CONFIG_FIELD_CASES: Array<{
    field: string;
    body: Record<string, unknown>;
    entity: 'structure' | 'content';
  }> = [
    { field: 'isAvailable', body: { isAvailable: false }, entity: 'structure' },
    { field: 'levels', body: { levels: ['basic'] }, entity: 'structure' },
    {
      field: 'requiredSubscriptions',
      body: { requiredSubscriptions: ['associate'] },
      entity: 'structure',
    },
    { field: 'hasDebrief', body: { hasDebrief: false }, entity: 'content' },
    {
      field: 'needsVideoWatch',
      body: { needsVideoWatch: false },
      entity: 'content',
    },
  ];
  const OTHER_ENTITY: Record<'structure' | 'content', 'structure' | 'content'> =
    { structure: 'content', content: 'structure' };

  it.each(
    CONFIG_FIELD_CASES,
  )('$field alone asks only for $entity:update', async ({ body, entity }) => {
    m.updateLessonConfig.mockResolvedValue({ id: 10 });
    await patchLessonHandler(req(body), '10');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      entity,
      'update',
    );
    expect(m.requireCoursePermission).not.toHaveBeenCalledWith(
      expect.anything(),
      42,
      OTHER_ENTITY[entity],
      'update',
    );
  });
});

describe('patchLessonHandler — config branch, split by field group', () => {
  it('lets a course manager set the level tag', async () => {
    m.updateLessonConfig.mockResolvedValue({ id: 10, levels: ['basic'] });
    await patchLessonHandler(req({ levels: ['basic'] }), '10');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'update',
    );
    expect(m.requireCoursePermission).not.toHaveBeenCalledWith(
      expect.anything(),
      42,
      'content',
      'update',
    );
    expect(m.updateLessonConfig).toHaveBeenCalledWith(10, {
      levels: ['basic'],
    });
  });

  it('requires content:update to change the debrief flag', async () => {
    m.updateLessonConfig.mockResolvedValue({ id: 10, hasDebrief: false });
    await patchLessonHandler(req({ hasDebrief: false }), '10');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'content',
      'update',
    );
    expect(m.requireCoursePermission).not.toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'update',
    );
  });

  it('requires BOTH when a body mixes the two groups', async () => {
    m.updateLessonConfig.mockResolvedValue({ id: 10 });
    await patchLessonHandler(
      req({ levels: ['basic'], hasDebrief: false }),
      '10',
    );
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'update',
    );
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'content',
      'update',
    );
  });

  // The single most important test in this file: a partial permission must
  // not produce a partial write. Structure passes, content is refused — the
  // whole request must 403 and updateLessonConfig must never run.
  it('writes nothing when the content half is refused', async () => {
    m.requireCoursePermission
      .mockResolvedValueOnce({ userId: 'u1' }) // structure passes
      .mockRejectedValueOnce(new m.ForbiddenError()); // content refused
    const res = await patchLessonHandler(
      req({ levels: ['basic'], hasDebrief: false }),
      '10',
    );
    expect(res.status).toBe(403);
    expect(m.updateLessonConfig).not.toHaveBeenCalled();
  });

  // And the mirror case, so the order of the two checks isn't load-bearing.
  it('writes nothing when the structure half is refused', async () => {
    m.requireCoursePermission
      .mockRejectedValueOnce(new m.ForbiddenError()) // structure refused
      .mockResolvedValueOnce({ userId: 'u1' }); // content would pass
    const res = await patchLessonHandler(
      req({ levels: ['basic'], hasDebrief: false }),
      '10',
    );
    expect(res.status).toBe(403);
    expect(m.updateLessonConfig).not.toHaveBeenCalled();
  });

  it('404s when the config write target has vanished', async () => {
    m.updateLessonConfig.mockResolvedValue(null);
    const res = await patchLessonHandler(req({ levels: ['basic'] }), '10');
    expect(res.status).toBe(404);
  });
});

describe('deleteLessonHandler', () => {
  it('asks for structure:delete scoped to the lesson’s course', async () => {
    m.deleteLesson.mockResolvedValue(true);
    await deleteLessonHandler(new Request('http://test/x'), '10');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'delete',
    );
  });

  it('404s a lesson that does not exist, before guarding', async () => {
    m.getCourseIdForLessonId.mockResolvedValue(null);
    const res = await deleteLessonHandler(new Request('http://test/x'), '999');
    expect(res.status).toBe(404);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.deleteLesson).not.toHaveBeenCalled();
  });

  it('403s a refused actor without deleting', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await deleteLessonHandler(new Request('http://test/x'), '10');
    expect(res.status).toBe(403);
    expect(m.deleteLesson).not.toHaveBeenCalled();
  });

  it('deletes once permitted', async () => {
    m.deleteLesson.mockResolvedValue(true);
    const res = await deleteLessonHandler(new Request('http://test/x'), '10');
    expect(res.status).toBe(204);
    expect(m.deleteLesson).toHaveBeenCalledWith(10);
  });
});
