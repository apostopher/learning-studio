// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {}
  return {
    ForbiddenError,
    waitUntil: vi.fn(),
    indexLessonVersions: vi.fn(),
    requireCoursePermission: vi.fn(),
    coursesAreInOrg: vi.fn(),
    updateCourseLessonVersion: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 1 }));
vi.mock('@vercel/functions', () => ({ waitUntil: m.waitUntil }));
vi.mock('#/lib/index-lesson-versions.server', () => ({
  indexLessonVersions: m.indexLessonVersions,
}));
vi.mock('#/db/course-remixes', () => ({ coursesAreInOrg: m.coursesAreInOrg }));
vi.mock('#/db/lesson-versions', () => ({
  updateCourseLessonVersion: m.updateCourseLessonVersion,
}));

import { postCourseLessonVersionHandler } from '../courses.$courseId.lessons.$lessonId.version';

const post = (body: unknown = { toVersion: '1.1' }) =>
  new Request('http://test/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Course 1 owns the module lesson 9 sits in; course 2 borrows it. */
const OWNER = 1;
const BORROWER = 2;
/** The caller holds `structure` on these courses and no other. */
function staffOf(...courseIds: number[]) {
  m.requireCoursePermission.mockImplementation(
    async (_headers: Headers, courseId: number) => {
      if (!courseIds.includes(courseId)) throw new m.ForbiddenError();
      return { userId: 'u1' };
    },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  staffOf(BORROWER);
  m.coursesAreInOrg.mockResolvedValue(true);
  m.updateCourseLessonVersion.mockResolvedValue({
    ok: true,
    version: '1.1',
    createdVersionIds: [501],
  });
});

describe('POST /api/admin/courses/:courseId/lessons/:lessonId/version', () => {
  it("200 for the borrower's staff, updating that course alone", async () => {
    const request = post();
    const res = await postCourseLessonVersionHandler(request, '2', '9');

    expect(res.status).toBe(200);
    // Not the created ids: they are for the server only.
    expect(await res.json()).toEqual({ version: '1.1' });
    expect(m.requireCoursePermission.mock.calls).toEqual([
      [request.headers, BORROWER, 'structure', 'update'],
    ]);
    expect(m.updateCourseLessonVersion.mock.calls).toEqual([
      [{ courseId: BORROWER, lessonId: 9, toVersion: '1.1' }],
    ]);
  });

  it("403 without structure on the viewed course, even when staff of the module's owner", async () => {
    staffOf(OWNER);
    const res = await postCourseLessonVersionHandler(post(), '2', '9');

    expect(res.status).toBe(403);
    expect(m.requireCoursePermission.mock.calls.map((c) => c[1])).toEqual([
      BORROWER,
    ]);
    expect(m.updateCourseLessonVersion).not.toHaveBeenCalled();
  });

  it('does not swallow an error from the guard', async () => {
    m.requireCoursePermission.mockRejectedValue(new Error('db down'));
    await expect(
      postCourseLessonVersionHandler(post(), '2', '9'),
    ).rejects.toThrow('db down');
  });

  // An admin passes `structure` on any course, so the guard alone lets them
  // into another organisation's.
  it("404s another organisation's course, the guard notwithstanding", async () => {
    m.coursesAreInOrg.mockResolvedValue(false);
    const res = await postCourseLessonVersionHandler(post(), '2', '9');

    expect(res.status).toBe(404);
    expect(m.coursesAreInOrg).toHaveBeenCalledWith(1, [BORROWER]);
    expect(m.updateCourseLessonVersion).not.toHaveBeenCalled();
  });

  it('stale and current map to 409', async () => {
    m.updateCourseLessonVersion.mockResolvedValue({
      ok: false,
      reason: 'stale',
    });
    const stale = await postCourseLessonVersionHandler(post(), '2', '9');
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      error: 'Disciplines has changed since you opened this. Try again.',
      code: 'stale',
    });

    m.updateCourseLessonVersion.mockResolvedValue({
      ok: false,
      reason: 'current',
    });
    const current = await postCourseLessonVersionHandler(post(), '2', '9');
    expect(current.status).toBe(409);
    expect(await current.json()).toEqual({
      error: 'This course already has this version.',
      code: 'current',
    });
    expect(m.waitUntil).not.toHaveBeenCalled();
  });

  it('404 for a lesson the course does not show', async () => {
    m.updateCourseLessonVersion.mockResolvedValue({
      ok: false,
      reason: 'not-found',
    });
    const res = await postCourseLessonVersionHandler(post(), '2', '9');
    expect(res.status).toBe(404);
    expect(m.waitUntil).not.toHaveBeenCalled();
  });

  it.each([
    ['abc', '9'],
    ['0', '9'],
    ['1.5', '9'],
    ['2', '-1'],
    ['2', 'x'],
    ['2', ''],
  ])('404 for ids that are not positive integers (%s, %s)', async (courseId, lessonId) => {
    const res = await postCourseLessonVersionHandler(
      post(),
      courseId,
      lessonId,
    );
    expect(res.status).toBe(404);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
    expect(m.updateCourseLessonVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['no version', {}],
    ['a malformed version', { toVersion: '1' }],
    ['a leading zero', { toVersion: '01.1' }],
    ['a number', { toVersion: 1.1 }],
    ['an extra key', { toVersion: '1.1', lessonId: 4 }],
    ['not JSON', '{'],
  ])('400 for %s', async (_what, body) => {
    const res = await postCourseLessonVersionHandler(post(body), '2', '9');
    expect(res.status).toBe(400);
    expect(m.updateCourseLessonVersion).not.toHaveBeenCalled();
  });
});
