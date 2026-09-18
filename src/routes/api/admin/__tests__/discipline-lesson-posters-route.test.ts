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
    getDisciplineLessonPosters: vi.fn(),
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
vi.mock('#/db/library-posters', () => ({
  getDisciplineLessonPosters: m.getDisciplineLessonPosters,
}));

import { getDisciplineLessonPostersHandler } from '../disciplines.$disciplineId.lesson-posters';

const req = () => new Request('http://t/x', { method: 'GET' });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireLessonContentPermission.mockResolvedValue(undefined);
  m.findDisciplineInOrg.mockResolvedValue({ id: 4 });
  m.getDisciplineLessonPosters.mockResolvedValue({ 1: 'https://p/1.jpg' });
});

describe('GET /api/admin/disciplines/:disciplineId/lesson-posters', () => {
  it('org-checks the discipline, asks for content:read on it, and answers its posters', async () => {
    const res = await getDisciplineLessonPostersHandler(req(), '4');
    expect(m.findDisciplineInOrg).toHaveBeenCalledWith(1, 4);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      4,
      'read',
    );
    expect(m.getDisciplineLessonPosters).toHaveBeenCalledWith(1, 4);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ 1: 'https://p/1.jpg' });
  });

  it('serves the org bag under id 0 as the admin-only Untitled shelf', async () => {
    const res = await getDisciplineLessonPostersHandler(req(), '0');
    expect(m.findDisciplineInOrg).not.toHaveBeenCalled();
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      null,
      'read',
    );
    expect(m.getDisciplineLessonPosters).toHaveBeenCalledWith(1, null);
    expect(res.status).toBe(200);
  });

  it('404s a discipline outside the org before guarding or reading', async () => {
    m.findDisciplineInOrg.mockResolvedValueOnce(null);
    const res = await getDisciplineLessonPostersHandler(req(), '77');
    expect(res.status).toBe(404);
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
    expect(m.getDisciplineLessonPosters).not.toHaveBeenCalled();
  });

  it('403s when refused, without reading posters', async () => {
    m.requireLessonContentPermission.mockRejectedValueOnce(
      new m.ForbiddenError(),
    );
    const res = await getDisciplineLessonPostersHandler(req(), '4');
    expect(res.status).toBe(403);
    expect(m.getDisciplineLessonPosters).not.toHaveBeenCalled();
  });

  it('400s an unparseable id before anything else', async () => {
    const res = await getDisciplineLessonPostersHandler(req(), 'nonsense');
    expect(res.status).toBe(400);
    expect(m.findDisciplineInOrg).not.toHaveBeenCalled();
  });
});
