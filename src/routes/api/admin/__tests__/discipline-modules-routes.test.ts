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
    requireLessonContentPermission: vi.fn(),
    absentResourceResponse: vi.fn(
      () => new Response('Not found', { status: 404 }),
    ),
    getActiveOrgId: vi.fn(() => 1),
    findDisciplineInOrg: vi.fn(),
    getDisciplineIdForLessonId: vi.fn(),
    createDisciplineModule: vi.fn(),
    renameDisciplineModule: vi.fn(),
    reorderDisciplineModule: vi.fn(),
    deleteDisciplineModule: vi.fn(),
    placeLessonInLibrary: vi.fn(),
    getDisciplineIdForDisciplineModule: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireLessonContentPermission: m.requireLessonContentPermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/lib/active-org.server', () => ({
  getActiveOrgId: m.getActiveOrgId,
}));
vi.mock('#/db/disciplines', () => ({
  findDisciplineInOrg: m.findDisciplineInOrg,
}));
vi.mock('#/db/lesson-access', () => ({
  getDisciplineIdForLessonId: m.getDisciplineIdForLessonId,
}));
vi.mock('#/db/discipline-modules', () => ({
  createDisciplineModule: m.createDisciplineModule,
  renameDisciplineModule: m.renameDisciplineModule,
  reorderDisciplineModule: m.reorderDisciplineModule,
  deleteDisciplineModule: m.deleteDisciplineModule,
  placeLessonInLibrary: m.placeLessonInLibrary,
  getDisciplineIdForDisciplineModule: m.getDisciplineIdForDisciplineModule,
}));

import {
  deleteDisciplineModuleHandler,
  patchDisciplineModuleHandler,
} from '../discipline-modules.$moduleId';
import { postDisciplineModuleHandler } from '../disciplines.$disciplineId.modules';
import { patchLibraryPlacementHandler } from '../lessons.$lessonId.library-placement';

const json = (method: string, body?: unknown) =>
  new Request('http://t/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireLessonContentPermission.mockResolvedValue(undefined);
  m.findDisciplineInOrg.mockResolvedValue({ id: 4 });
  m.getDisciplineIdForDisciplineModule.mockResolvedValue(4);
  m.getDisciplineIdForLessonId.mockResolvedValue({
    found: true,
    disciplineId: 4,
  });
});

describe('POST /api/admin/disciplines/:id/modules', () => {
  it('checks org ownership, then asks for content:create on THAT discipline, then creates', async () => {
    m.createDisciplineModule.mockResolvedValue({
      id: 7,
      name: 'Basics',
      rank: 1,
    });
    const res = await postDisciplineModuleHandler(
      json('POST', { name: 'Basics' }),
      '4',
    );
    expect(m.findDisciplineInOrg).toHaveBeenCalledWith(1, 4);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      4,
      'create',
    );
    expect(m.createDisciplineModule).toHaveBeenCalledWith(4, 'Basics');
    expect(res.status).toBe(201);
  });
  it('404s an unowned discipline before guarding', async () => {
    m.findDisciplineInOrg.mockResolvedValue(null);
    const res = await postDisciplineModuleHandler(
      json('POST', { name: 'Basics' }),
      '4',
    );
    expect(res.status).toBe(404);
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
  });
  it('403s when refused, without creating', async () => {
    m.requireLessonContentPermission.mockRejectedValue(new m.ForbiddenError());
    expect(
      (await postDisciplineModuleHandler(json('POST', { name: 'Basics' }), '4'))
        .status,
    ).toBe(403);
    expect(m.createDisciplineModule).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/discipline-modules/:id', () => {
  /**
   * The bug shape: guarding on a discipline id from the BODY or the URL
   * rather than the one the module actually belongs to. Pinned as the
   * argument the guard received.
   */
  it('resolves the module’s discipline, checks ownership there, guards content:update, and renames', async () => {
    m.renameDisciplineModule.mockResolvedValue({ id: 7, name: 'Fundamentals' });
    const res = await patchDisciplineModuleHandler(
      json('PATCH', { name: 'Fundamentals' }),
      '7',
    );
    expect(m.getDisciplineIdForDisciplineModule).toHaveBeenCalledWith(7);
    expect(m.findDisciplineInOrg).toHaveBeenCalledWith(1, 4);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      4,
      'update',
    );
    expect(m.renameDisciplineModule).toHaveBeenCalledWith(7, 'Fundamentals');
    expect(res.status).toBe(200);
  });
  it('routes a neighbour body to the reorder writer and 404s when the neighbour is not in the discipline', async () => {
    m.reorderDisciplineModule.mockResolvedValue(null);
    const res = await patchDisciplineModuleHandler(
      json('PATCH', { prevModuleId: 6, nextModuleId: null }),
      '7',
    );
    expect(m.reorderDisciplineModule).toHaveBeenCalledWith({
      moduleId: 7,
      prevModuleId: 6,
      nextModuleId: null,
    });
    expect(res.status).toBe(404);
  });
  it('404s an unknown module before guarding', async () => {
    m.getDisciplineIdForDisciplineModule.mockResolvedValue(null);
    expect(
      (await patchDisciplineModuleHandler(json('PATCH', { name: 'x' }), '7'))
        .status,
    ).toBe(404);
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/discipline-modules/:id', () => {
  it('guards content:delete on the module’s discipline and 204s with an empty body', async () => {
    m.deleteDisciplineModule.mockResolvedValue({ ok: true });
    const res = await deleteDisciplineModuleHandler(json('DELETE'), '7');
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      4,
      'delete',
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});

describe('PATCH /api/admin/lessons/:id/library-placement', () => {
  /**
   * Guarded on the LESSON's discipline, never the target module's: the
   * writer refuses a module of another discipline anyway, but the guard
   * must not be reachable by naming a module the actor happens to hold.
   */
  it('guards content:update on the lesson’s discipline and files the lesson', async () => {
    m.placeLessonInLibrary.mockResolvedValue({ ok: true, rank: 1.5 });
    const res = await patchLibraryPlacementHandler(
      json('PATCH', {
        disciplineModuleId: 7,
        prevLessonId: 11,
        nextLessonId: null,
      }),
      '10',
    );
    expect(m.getDisciplineIdForLessonId).toHaveBeenCalledWith(10);
    expect(m.findDisciplineInOrg).toHaveBeenCalledWith(1, 4);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      4,
      'update',
    );
    expect(m.placeLessonInLibrary).toHaveBeenCalledWith({
      lessonId: 10,
      disciplineModuleId: 7,
      prevLessonId: 11,
      nextLessonId: null,
    });
    expect(res.status).toBe(200);
  });
  it('400s a module of another discipline, naming both', async () => {
    m.placeLessonInLibrary.mockResolvedValue({
      ok: false,
      reason: 'wrong-discipline',
      lessonDiscipline: 'Weather',
      moduleDiscipline: 'Navigation',
    });
    const res = await patchLibraryPlacementHandler(
      json('PATCH', {
        disciplineModuleId: 7,
        prevLessonId: null,
        nextLessonId: null,
      }),
      '10',
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error:
        'This lesson is in Weather; that module is in Navigation. Lessons stay in their discipline — file it into one of Weather’s modules.',
    });
  });
  /**
   * Cross-tenant disclosure: the writer's `wrong-discipline` refusal echoes
   * the target module's discipline NAME, so a module id from another org
   * reaching it would name that org's discipline in this org's 400. The
   * target module is resolved and org-checked in the route — the same
   * `getDisciplineIdForDisciplineModule` → `findDisciplineInOrg` ordering
   * the module routes use — AFTER the lesson-side guard (the body carrying
   * the module id is only read once the actor is admitted), and a module
   * outside the org is 404, not a naming 400.
   */
  it('404s a module of another org without naming its discipline; the guard still ran on the LESSON’s discipline', async () => {
    // Module 99 belongs to discipline 77, which is not in org 1.
    m.getDisciplineIdForDisciplineModule.mockResolvedValue(77);
    m.findDisciplineInOrg.mockImplementation(
      async (_orgId: number, disciplineId: number) =>
        disciplineId === 4 ? { id: 4 } : null,
    );
    m.placeLessonInLibrary.mockResolvedValue({
      ok: false,
      reason: 'wrong-discipline',
      lessonDiscipline: 'Weather',
      moduleDiscipline: 'Other Org Secret',
    });
    const res = await patchLibraryPlacementHandler(
      json('PATCH', {
        disciplineModuleId: 99,
        prevLessonId: null,
        nextLessonId: null,
      }),
      '10',
    );
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('Other Org Secret');
    expect(m.getDisciplineIdForDisciplineModule).toHaveBeenCalledWith(99);
    expect(m.findDisciplineInOrg).toHaveBeenCalledWith(1, 77);
    expect(m.requireLessonContentPermission).toHaveBeenCalledTimes(1);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      4,
      'update',
    );
    expect(m.placeLessonInLibrary).not.toHaveBeenCalled();
  });
  it('404s a target module that does not exist, without writing', async () => {
    m.getDisciplineIdForDisciplineModule.mockResolvedValue(null);
    const res = await patchLibraryPlacementHandler(
      json('PATCH', {
        disciplineModuleId: 99,
        prevLessonId: null,
        nextLessonId: null,
      }),
      '10',
    );
    expect(res.status).toBe(404);
    expect(m.placeLessonInLibrary).not.toHaveBeenCalled();
  });
  it('filing back to Untitled (null module) resolves no module at all', async () => {
    m.placeLessonInLibrary.mockResolvedValue({ ok: true, rank: 1 });
    const res = await patchLibraryPlacementHandler(
      json('PATCH', {
        disciplineModuleId: null,
        prevLessonId: null,
        nextLessonId: null,
      }),
      '10',
    );
    expect(res.status).toBe(200);
    expect(m.getDisciplineIdForDisciplineModule).not.toHaveBeenCalled();
    expect(m.placeLessonInLibrary).toHaveBeenCalledWith({
      lessonId: 10,
      disciplineModuleId: null,
      prevLessonId: null,
      nextLessonId: null,
    });
  });
  it('an Untitled (null) lesson has no discipline to guard — 404, and nothing is written', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValue({
      found: true,
      disciplineId: null,
    });
    const res = await patchLibraryPlacementHandler(
      json('PATCH', {
        disciplineModuleId: null,
        prevLessonId: null,
        nextLessonId: null,
      }),
      '10',
    );
    expect(res.status).toBe(404);
    expect(m.placeLessonInLibrary).not.toHaveBeenCalled();
  });
});
