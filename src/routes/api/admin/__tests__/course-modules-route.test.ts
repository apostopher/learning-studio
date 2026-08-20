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
    createModule: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/admin', () => ({ createModule: m.createModule }));

import { postModuleHandler } from '../courses.$courseId.modules';

function req(body: unknown = { name: 'Weather' }): Request {
  return new Request('http://t/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.createModule.mockResolvedValue({ id: 1, name: 'Weather' });
});

describe('POST /api/admin/courses/:courseId/modules', () => {
  it('asks for structure:create on that specific course', async () => {
    await postModuleHandler(req(), '3');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      3,
      'structure',
      'create',
    );
  });

  it('403s when refused, without creating a module', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postModuleHandler(req(), '3');
    expect(res.status).toBe(403);
    expect(m.createModule).not.toHaveBeenCalled();
  });

  it('400s an unparseable course id before guarding', async () => {
    const res = await postModuleHandler(req(), 'nonsense');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('400s a schema failure before creating', async () => {
    const res = await postModuleHandler(req({ name: '' }), '3');
    expect(res.status).toBe(400);
    expect(m.createModule).not.toHaveBeenCalled();
  });

  it('creates the module scoped to the course', async () => {
    await postModuleHandler(req({ name: 'Weather' }), '3');
    expect(m.createModule).toHaveBeenCalledWith({
      courseId: 3,
      name: 'Weather',
      imageUrlAvif: null,
      imageUrlWebp: null,
    });
  });
});
