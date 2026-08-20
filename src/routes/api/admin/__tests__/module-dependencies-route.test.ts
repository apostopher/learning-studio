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
    deleteModule: vi.fn(),
    reorderModule: vi.fn(),
    updateModule: vi.fn(),
    updateModuleDependencies: vi.fn(),
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
  deleteModule: m.deleteModule,
  reorderModule: m.reorderModule,
  updateModule: m.updateModule,
  updateModuleDependencies: m.updateModuleDependencies,
}));

import { deleteModuleHandler, patchModuleHandler } from '../modules.$moduleId';

const patch = (body: unknown): Request =>
  new Request('http://test/api/admin/modules/7', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseIdForModuleId.mockResolvedValue(42);
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  // Stands in for the real helper (unit-tested in
  // lib/__tests__/permissions-server.test.ts): it answers 404 to someone on
  // the teaching side and a flat 403 to everyone else, so a missing row
  // cannot be used to enumerate ids.
  m.absentResourceResponse.mockResolvedValue(
    new Response(null, { status: 404 }),
  );
});

describe('patchModuleHandler — course resolution and guard', () => {
  it('asks for structure:update scoped to the module’s course', async () => {
    m.updateModuleDependencies.mockResolvedValue({ ok: true, dependsOn: [] });
    await patchModuleHandler(patch({ dependsOn: [] }), '7');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'update',
    );
  });

  /**
   * The enumeration oracle. This handler resolves the row BEFORE guarding, so
   * an unauthenticated caller could walk sequential integer ids and read the
   * id space off the status code — 404 absent, 403 present. The absent branch
   * is delegated to `absentResourceResponse`, which answers 404 only to
   * someone on the teaching side (unit-tested in
   * lib/__tests__/permissions-server.test.ts).
   */
  it('hands an absent module to absentResourceResponse and returns its answer', async () => {
    m.getCourseIdForModuleId.mockResolvedValue(null);
    m.absentResourceResponse.mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );
    const request = patch({ dependsOn: ['a'] });

    const res = await patchModuleHandler(request, '999');

    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Module not found',
    );
    expect(res.status).toBe(403);
    expect(m.updateModuleDependencies).not.toHaveBeenCalled();
  });

  it('404s a module that does not exist, before guarding', async () => {
    m.getCourseIdForModuleId.mockResolvedValue(null);
    const res = await patchModuleHandler(patch({ dependsOn: ['a'] }), '999');
    expect(res.status).toBe(404);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.updateModuleDependencies).not.toHaveBeenCalled();
  });

  it('403s a refused course manager before touching the database', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchModuleHandler(patch({ dependsOn: ['a'] }), '7');
    expect(res.status).toBe(403);
    expect(m.updateModuleDependencies).not.toHaveBeenCalled();
  });

  it('400s an invalid module id without resolving a course or guarding', async () => {
    const res = await patchModuleHandler(patch({ dependsOn: ['a'] }), 'abc');
    expect(res.status).toBe(400);
    expect(m.getCourseIdForModuleId).not.toHaveBeenCalled();
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.updateModuleDependencies).not.toHaveBeenCalled();
  });
});

describe('patchModuleHandler — dependencies', () => {
  it('forwards the parsed slugs to the writer', async () => {
    // The point of the whole route: assert what the writer RECEIVED, not that
    // the response looks plausible.
    m.updateModuleDependencies.mockResolvedValue({
      ok: true,
      dependsOn: ['a', 'b'],
    });
    const res = await patchModuleHandler(patch({ dependsOn: ['a', 'b'] }), '7');
    expect(res.status).toBe(200);
    expect(m.updateModuleDependencies).toHaveBeenCalledWith(7, ['a', 'b']);
  });

  it('forwards an empty array rather than treating it as no-op', async () => {
    // Clearing every prerequisite is a real edit; if the route skipped it,
    // removing the last chip would silently do nothing.
    m.updateModuleDependencies.mockResolvedValue({ ok: true, dependsOn: [] });
    await patchModuleHandler(patch({ dependsOn: [] }), '7');
    expect(m.updateModuleDependencies).toHaveBeenCalledWith(7, []);
  });

  it('409s on a cycle and names the offending slugs', async () => {
    // 409 specifically — the client keys its "reload the latest" message on
    // this status, so a 400 here would surface the wrong copy.
    m.updateModuleDependencies.mockResolvedValue({
      ok: false,
      reason: 'cycle',
      slugs: ['b'],
    });
    const res = await patchModuleHandler(patch({ dependsOn: ['b'] }), '7');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'cycle', slugs: ['b'] });
  });

  it('400s on slugs that name no module in the course', async () => {
    m.updateModuleDependencies.mockResolvedValue({
      ok: false,
      reason: 'unknown-modules',
      slugs: ['ghost'],
    });
    const res = await patchModuleHandler(patch({ dependsOn: ['ghost'] }), '7');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'unknown-modules',
      slugs: ['ghost'],
    });
  });

  it('404s an unknown module', async () => {
    m.updateModuleDependencies.mockResolvedValue({
      ok: false,
      reason: 'not-found',
    });
    const res = await patchModuleHandler(patch({ dependsOn: ['a'] }), '7');
    expect(res.status).toBe(404);
  });

  it('does not route a rename to the dependency writer', async () => {
    // The two bodies are disjoint, and the dependency branch is checked first
    // — a rename must still reach updateModule.
    m.updateModule.mockResolvedValue({ id: 7, name: 'Renamed' });
    await patchModuleHandler(patch({ name: 'Renamed' }), '7');
    expect(m.updateModuleDependencies).not.toHaveBeenCalled();
    expect(m.updateModule).toHaveBeenCalledWith(7, { name: 'Renamed' });
  });

  it('does not route a reorder to the dependency writer', async () => {
    m.reorderModule.mockResolvedValue({ id: 7 });
    await patchModuleHandler(
      patch({ prevModuleId: 1, nextModuleId: null }),
      '7',
    );
    expect(m.updateModuleDependencies).not.toHaveBeenCalled();
    expect(m.reorderModule).toHaveBeenCalled();
  });
});

describe('deleteModuleHandler', () => {
  it('asks for structure:delete scoped to the module’s course', async () => {
    m.deleteModule.mockResolvedValue(true);
    await deleteModuleHandler(new Request('http://test/x'), '7');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'structure',
      'delete',
    );
  });

  it('404s a module that does not exist, before guarding', async () => {
    m.getCourseIdForModuleId.mockResolvedValue(null);
    const res = await deleteModuleHandler(new Request('http://test/x'), '999');
    expect(res.status).toBe(404);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.deleteModule).not.toHaveBeenCalled();
  });

  it('403s a refused course manager without deleting', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await deleteModuleHandler(new Request('http://test/x'), '7');
    expect(res.status).toBe(403);
    expect(m.deleteModule).not.toHaveBeenCalled();
  });

  it('deletes once permitted', async () => {
    m.deleteModule.mockResolvedValue(true);
    const res = await deleteModuleHandler(new Request('http://test/x'), '7');
    expect(res.status).toBe(204);
    expect(m.deleteModule).toHaveBeenCalledWith(7);
  });
});
