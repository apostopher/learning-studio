// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every route that can take a lesson into a course, against the REAL indexer:
 * only the database read and the embedding call are stubbed.
 */
const m = vi.hoisted(() => ({
  waitUntil: vi.fn(),
  generateLessonEmbeddings: vi.fn(),
  readSnapshot: vi.fn(),
  linkLesson: vi.fn(),
  copyDisciplineModuleIntoCourse: vi.fn(),
  remixCourse: vi.fn(),
  createCourse: vi.fn(),
}));
vi.mock('@vercel/functions', () => ({ waitUntil: m.waitUntil }));
vi.mock('#/ai/embeddings', () => ({
  generateLessonEmbeddings: m.generateLessonEmbeddings,
  lessonMaterialHtml: (s: { text: string }) => s.text,
}));
vi.mock('#/db', () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => m.readSnapshot(),
  };
  return { db: { select: () => chain } };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: class extends Error {},
}));
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 1 }));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: async () => ({ userId: 'u1' }),
  requireCourseCreation: async () => undefined,
  requirePermission: vi.fn(),
  getStaffScopedCourseIds: vi.fn(),
  absentResourceResponse: vi.fn(),
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: async () => 3,
}));
vi.mock('#/db/placements', () => ({ linkLesson: m.linkLesson }));
vi.mock('#/db/copy-discipline-module', () => ({
  copyDisciplineModuleIntoCourse: m.copyDisciplineModuleIntoCourse,
}));
vi.mock('#/db/course-remixes', () => ({
  remixCourse: m.remixCourse,
  coursesAreInOrg: async () => true,
}));
vi.mock('#/db/admin', () => ({
  createCourse: m.createCourse,
  listAdminCourses: vi.fn(),
}));

import { createCourseHandler } from '../courses';
import { postModuleFromLibraryHandler } from '../courses.$courseId.modules.from-library';
import { postRemixHandler } from '../courses.$courseId.remixes';
import { postLessonHandler } from '../modules.$moduleId.lessons';

const post = (body: unknown) =>
  new Request('http://t/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ROUTES: [string, () => Promise<Response>, number, unknown][] = [
  [
    'linking a lesson',
    () => postLessonHandler(post({ lessonId: 9 }), '40'),
    200,
    { id: 1 },
  ],
  [
    'copying a module',
    () =>
      postModuleFromLibraryHandler(
        post({ disciplineModuleId: 7, afterModuleId: null }),
        '3',
      ),
    200,
    { module: { id: 900 } },
  ],
  [
    'remixing a course',
    () => postRemixHandler(post({ sourceCourseId: 6 }), '2'),
    201,
    { moduleCount: 7 },
  ],
  [
    'creating a course',
    () => createCourseHandler(post({ name: 'CPL' })),
    200,
    { id: 2 },
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
  const createdVersionIds = [501];
  m.linkLesson.mockResolvedValue({ id: 1, createdVersionIds });
  m.copyDisciplineModuleIntoCourse.mockResolvedValue({
    module: { id: 900 },
    createdVersionIds,
  });
  m.remixCourse.mockResolvedValue({
    ok: true,
    moduleCount: 7,
    createdVersionIds,
  });
  m.createCourse.mockResolvedValue({ id: 2, createdVersionIds });
  m.readSnapshot.mockResolvedValue([
    { id: 501, slug: 'wx-1', version: '1.0', text: 'T', proTips: null },
  ]);
  m.generateLessonEmbeddings.mockResolvedValue({ chunks: 1 });
});

describe.each(ROUTES)('%s', (_name, call, status, body) => {
  it('indexes the created ids via waitUntil', async () => {
    const res = await call();
    expect(res.status).toBe(status);
    // The ids are for the server only.
    expect(await res.json()).toEqual(body);

    expect(m.waitUntil).toHaveBeenCalledTimes(1);
    await m.waitUntil.mock.calls[0][0];
    expect(m.generateLessonEmbeddings.mock.calls).toEqual([
      [{ lessonVersionId: 501, lessonSlug: 'wx-1', version: '1.0', html: 'T' }],
    ]);
  });

  it('does not wait for the index before answering', async () => {
    m.generateLessonEmbeddings.mockReturnValue(new Promise(() => {}));
    expect((await call()).status).toBe(status);
  });

  it('an indexing failure does not fail the route', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.generateLessonEmbeddings.mockRejectedValue(new Error('quota'));
    const res = await call();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    // A rejection here would surface as an unhandled one.
    await expect(m.waitUntil.mock.calls[0][0]).resolves.toEqual({
      indexed: 0,
      failed: [501],
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('when nothing was taken', () => {
  it('a duplicate link and a refused remix index nothing', async () => {
    m.linkLesson.mockResolvedValue('duplicate');
    m.remixCourse.mockResolvedValue({ ok: false, reason: 'already-remixed' });
    expect((await ROUTES[0][1]()).status).toBe(409);
    expect((await ROUTES[2][1]()).status).toBe(409);
    expect(m.waitUntil).not.toHaveBeenCalled();
  });
});
