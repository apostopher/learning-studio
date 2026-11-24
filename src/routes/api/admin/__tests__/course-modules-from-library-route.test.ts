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
    waitUntil: vi.fn(),
    indexLessonVersions: vi.fn(),
    requireCoursePermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    copyDisciplineModuleIntoCourse: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('@vercel/functions', () => ({ waitUntil: m.waitUntil }));
vi.mock('#/lib/index-lesson-versions.server', () => ({
  indexLessonVersions: m.indexLessonVersions,
}));
vi.mock('#/db/copy-discipline-module', () => ({
  copyDisciplineModuleIntoCourse: m.copyDisciplineModuleIntoCourse,
}));

import { postModuleFromLibraryHandler } from '../courses.$courseId.modules.from-library';

function req(
  body: unknown = { disciplineModuleId: 7, afterModuleId: 40 },
): Request {
  return new Request('http://t/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.absentResourceResponse.mockResolvedValue(
    new Response('Not found', { status: 404 }),
  );
  m.copyDisciplineModuleIntoCourse.mockResolvedValue({
    module: { id: 900 },
    placedLessonIds: [1],
    skipped: [],
    createdVersionIds: [501],
  });
});

describe('POST /api/admin/courses/:courseId/modules/from-library', () => {
  it('asks for structure:create on the destination course', async () => {
    await postModuleFromLibraryHandler(req(), '3');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      3,
      'structure',
      'create',
    );
  });

  it('403s when refused, without copying anything', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postModuleFromLibraryHandler(req(), '3');
    expect(res.status).toBe(403);
    expect(m.copyDisciplineModuleIntoCourse).not.toHaveBeenCalled();
  });

  it('400s an unparseable course id before guarding', async () => {
    const res = await postModuleFromLibraryHandler(req(), 'nope');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('400s a body without a discipline module', async () => {
    const res = await postModuleFromLibraryHandler(
      req({ afterModuleId: null }),
      '3',
    );
    expect(res.status).toBe(400);
    expect(m.copyDisciplineModuleIntoCourse).not.toHaveBeenCalled();
  });

  it('copies into the course from the path, after the named module', async () => {
    const res = await postModuleFromLibraryHandler(req(), '3');
    expect(m.copyDisciplineModuleIntoCourse).toHaveBeenCalledWith({
      courseId: 3,
      disciplineModuleId: 7,
      afterModuleId: 40,
      onlyLessonId: undefined,
    });
    expect(await res.json()).toEqual({
      module: { id: 900 },
      placedLessonIds: [1],
      skipped: [],
    });
  });

  it('answers not-found for a module outside the course’s orgs', async () => {
    m.copyDisciplineModuleIntoCourse.mockResolvedValueOnce(null);
    const res = await postModuleFromLibraryHandler(req(), '3');
    expect(res.status).toBe(404);
    expect(m.absentResourceResponse).toHaveBeenCalled();
  });
});
