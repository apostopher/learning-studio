// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserRoleNames: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getLastViewedLessonId: vi.fn(),
  getCourseProgress: vi.fn(),
  getCurrentLevel: vi.fn(),
  isCourseStaff: vi.fn(),
  resolveResumeTargetForLevel: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/db/admin', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: m.getCourseDetailsWithCache,
}));
vi.mock('#/db/course-last-viewed', () => ({
  getLastViewedLessonId: m.getLastViewedLessonId,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: m.getCourseProgress,
}));
vi.mock('#/db/course-staff', () => ({ isCourseStaff: m.isCourseStaff }));
vi.mock('#/db/user-levels', () => ({ getCurrentLevel: m.getCurrentLevel }));
// Mocked rather than left real so the assertions can be made on what the
// resolver RECEIVED: `bypassLocks` and `level` are the whole output of this
// site, and a value computed but never handed on is the defect this file
// exists to catch.
vi.mock('#/lib/course-resume-level', () => ({
  resolveResumeTargetForLevel: m.resolveResumeTargetForLevel,
}));

import {
  resumeTargetForRequest,
  resumeTargetForUser,
} from '#/lib/course-resume-for-user';

const DETAILS = {
  id: 7,
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'Module 1',
      dependsOn: [],
      sequentialLessons: true,
      lessons: [
        {
          id: 10,
          slug: 'basic-1',
          name: 'Basic 1',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          dependsOn: [],
          levels: ['basic'],
        },
      ],
    },
  ],
};

const TARGET = { kind: 'none', reason: 'no-lessons' } as const;

const call = (courseSlug = 'comp-sci') =>
  resumeTargetForUser({ userId: 'u1', courseSlug });

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'session-user' } });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getCourseDetailsWithCache.mockResolvedValue(DETAILS);
  m.getLastViewedLessonId.mockResolvedValue(null);
  m.getCourseProgress.mockResolvedValue({ lessons: [] });
  m.getCurrentLevel.mockResolvedValue('intermediate');
  m.isCourseStaff.mockResolvedValue(false);
  m.resolveResumeTargetForLevel.mockReturnValue(TARGET);
});

describe('resumeTargetForUser — course staff', () => {
  it('resolves the destination without locks or a tier for staff on this course', async () => {
    m.isCourseStaff.mockResolvedValue(true);

    await call();

    expect(m.resolveResumeTargetForLevel).toHaveBeenCalledWith(
      expect.objectContaining({ bypassLocks: true, level: null }),
    );
    // The course id comes from the payload, so the grant is tested against
    // the course being resumed.
    expect(m.isCourseStaff).toHaveBeenCalledWith('u1', 7);
    expect(m.getCurrentLevel).not.toHaveBeenCalled();
    expect(m.getCourseProgress).not.toHaveBeenCalled();
  });

  it('keeps the locks and the tier for a learner who staffs another course', async () => {
    // The Biology professor resuming Computer Science: staff on 99, not 7.
    m.isCourseStaff.mockImplementation(
      async (_userId: string, courseId: number) => courseId === 99,
    );

    await call();

    expect(m.resolveResumeTargetForLevel).toHaveBeenCalledWith(
      expect.objectContaining({ bypassLocks: false, level: 'intermediate' }),
    );
    expect(m.getCurrentLevel).toHaveBeenCalledWith('u1', 7);
  });

  it('does not query staff for an admin — they bypass on role alone', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);

    await call();

    expect(m.resolveResumeTargetForLevel).toHaveBeenCalledWith(
      expect.objectContaining({ bypassLocks: true, level: null }),
    );
    expect(m.isCourseStaff).not.toHaveBeenCalled();
  });
});

/**
 * The seam the server fn's handler used to hide: everything below runs behind
 * `getCourseResumeTarget`, whose exported binding Start's compiler replaces
 * with an RPC shim no test can call. The handler now holds exactly one line —
 * `getRequestHeaders()` — and everything it produces is asserted here.
 */
describe('resumeTargetForRequest — session wiring', () => {
  it('resolves for the SIGNED-IN user, not for anything in the request data', async () => {
    m.getSession.mockResolvedValue({ user: { id: 'session-user' } });

    await resumeTargetForRequest({
      headers: { cookie: 'session=abc' },
      courseSlug: 'comp-sci',
    });

    // Every collaborator that takes a user id got the session's, and the
    // course slug went where a course slug goes. Swapping the two is
    // type-legal, which is exactly why this is asserted rather than assumed.
    expect(m.getUserRoleNames).toHaveBeenCalledWith('session-user');
    expect(m.getLastViewedLessonId).toHaveBeenCalledWith({
      userId: 'session-user',
      courseSlug: 'comp-sci',
    });
    expect(m.getCourseDetailsWithCache).toHaveBeenCalledWith('comp-sci');
    expect(m.isCourseStaff).toHaveBeenCalledWith('session-user', 7);
  });

  it('passes the request headers to the session lookup', async () => {
    // The one thing the handler still does is hand over the headers; if they
    // stopped arriving, every caller would silently read as anonymous.
    const headers = { cookie: 'session=abc' };

    await resumeTargetForRequest({ headers, courseSlug: 'comp-sci' });

    expect(m.getSession).toHaveBeenCalledWith({ headers });
  });

  it('reports nothing to resume for an anonymous caller, without reading a course', async () => {
    m.getSession.mockResolvedValue(null);

    const result = await resumeTargetForRequest({
      headers: {},
      courseSlug: 'comp-sci',
    });

    expect(result).toEqual({ kind: 'none', reason: 'no-lessons' });
    expect(m.getCourseDetailsWithCache).not.toHaveBeenCalled();
    expect(m.resolveResumeTargetForLevel).not.toHaveBeenCalled();
  });
});
