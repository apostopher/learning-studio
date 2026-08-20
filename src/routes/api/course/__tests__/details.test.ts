// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSession,
  getCourseDetailsWithCache,
  getCourseDetails,
  getUserRoleNames,
  isSubscribedToCourseSlug,
  getCourseIdentityBySlug,
  isCourseStaff,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseDetails: vi.fn(),
  getUserRoleNames: vi.fn(),
  isSubscribedToCourseSlug: vi.fn(),
  getCourseIdentityBySlug: vi.fn(),
  isCourseStaff: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache,
  getCourseDetails,
  getCourseIdentityBySlug,
}));
// This route carries a slug, not a course id, so the staff check resolves one
// first. The real modules are drizzle-backed and would open a connection.
vi.mock('#/db/course-staff', () => ({ isCourseStaff }));
vi.mock('#/db/admin', () => ({ getUserRoleNames }));
vi.mock('#/db/lesson-access', () => ({ isSubscribedToCourseSlug }));

import { getCourseDetailsHandler } from '../details';

const req = (query = '?slug=c1') =>
  new Request(`http://test/api/course/details${query}`);

// A trimmed stand-in for the real payload. Every field named here is one this
// route used to hand to anonymous callers. `videoProvider`/`videoRef`/
// `otherVideoIds` sit alongside `hasVideo` here to mirror the real
// `CourseDetails` shape (db/course.ts's `LessonDetails` carries all of them)
// — the handler strips all three before the response ships, which the
// assertions below prove. `videoProvider`/`videoRef` matter most: a bare Mux
// `videoRef` is directly streamable unless every asset is signed-policy-only,
// an operator setting this code cannot verify — shipping it would let a
// subscribed learner stream a video before satisfying its prerequisites.
const course = {
  id: 1,
  slug: 'c1',
  name: 'Course One',
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'M1',
      dependsOn: [],
      lessons: [
        {
          id: 10,
          slug: 'a',
          name: 'A',
          videoProvider: 'mux',
          videoRef: 'ref-secret',
          otherVideoIds: [],
          hasVideo: true,
          isAvailable: true,
          needsVideoWatch: true,
          dependsOn: [],
        },
      ],
    },
  ],
};

// What the route actually serves: same as `course`, minus every
// video-identifying field.
const learnerCourse = {
  ...course,
  modules: course.modules.map((mod) => ({
    ...mod,
    lessons: mod.lessons.map(
      ({
        videoProvider: _videoProvider,
        videoRef: _videoRef,
        otherVideoIds: _otherVideoIds,
        ...rest
      }) => rest,
    ),
  })),
};

describe('getCourseDetailsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    getUserRoleNames.mockResolvedValue([]);
    isSubscribedToCourseSlug.mockResolvedValue(true);
    getCourseDetailsWithCache.mockResolvedValue(course);
    getCourseDetails.mockResolvedValue(course);
    getCourseIdentityBySlug.mockResolvedValue({ id: 1, name: 'Course One' });
    isCourseStaff.mockResolvedValue(false);
  });

  it('401s an anonymous caller without reading the course', async () => {
    getSession.mockResolvedValue(null);

    const res = await getCourseDetailsHandler(req());

    expect(res.status).toBe(401);
    // The payload carries the whole dependency graph — which lesson blocks
    // which — the enumeration source /api/lesson/video was hardened against,
    // so an anonymous request must not reach the reader at all.
    expect(getCourseDetailsWithCache).not.toHaveBeenCalled();
    expect(getCourseDetails).not.toHaveBeenCalled();
  });

  it('checks the session before validating input', async () => {
    getSession.mockResolvedValue(null);

    // A missing slug must not shortcut past auth into a 400 that confirms the
    // route exists and what it wants.
    expect((await getCourseDetailsHandler(req(''))).status).toBe(401);
  });

  it('403s a signed-in caller with no subscription to the course', async () => {
    isSubscribedToCourseSlug.mockResolvedValue(false);

    const res = await getCourseDetailsHandler(req());

    expect(res.status).toBe(403);
    expect(getCourseDetailsWithCache).not.toHaveBeenCalled();
    expect(getCourseDetails).not.toHaveBeenCalled();
  });

  it('serves a subscriber the video-identity-free shape', async () => {
    const res = await getCourseDetailsHandler(req());

    expect(res.status).toBe(200);
    // Not `course` — the handler must strip every video-identifying field
    // before this reaches the client, since nothing outside the playback
    // layer should learn a video's identity from this route.
    const body = await res.json();
    expect(body).toEqual(learnerCourse);
    const lesson = body.modules[0].lessons[0];
    expect(lesson).not.toHaveProperty('videoProvider');
    expect(lesson).not.toHaveProperty('videoRef');
    expect(lesson).not.toHaveProperty('otherVideoIds');
    expect(isSubscribedToCourseSlug).toHaveBeenCalledWith('u1', 'c1');
  });

  it('serves an admin who is not subscribed, consistent with the rest of the gate', async () => {
    getUserRoleNames.mockResolvedValue(['admin']);
    isSubscribedToCourseSlug.mockResolvedValue(false);

    const res = await getCourseDetailsHandler(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(learnerCourse);
  });

  it('serves a subject expert the tree of the course they staff', async () => {
    isSubscribedToCourseSlug.mockResolvedValue(false);
    isCourseStaff.mockResolvedValue(true);

    const res = await getCourseDetailsHandler(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(learnerCourse);
    // The slug is resolved to an id and the grant tested against THAT course.
    expect(getCourseIdentityBySlug).toHaveBeenCalledWith('c1');
    expect(isCourseStaff).toHaveBeenCalledWith('u1', 1);
  });

  it('403s a subject expert on a course they do not staff', async () => {
    // The dependency graph is an enumeration surface. A grant on course 99
    // buys nothing on course 1.
    isSubscribedToCourseSlug.mockResolvedValue(false);
    isCourseStaff.mockImplementation(
      async (_userId: string, courseId: number) => courseId === 99,
    );

    const res = await getCourseDetailsHandler(req());

    expect(res.status).toBe(403);
    expect(getCourseDetailsWithCache).not.toHaveBeenCalled();
  });

  it('403s when the slug resolves to no course at all', async () => {
    isSubscribedToCourseSlug.mockResolvedValue(false);
    getCourseIdentityBySlug.mockResolvedValue(null);

    const res = await getCourseDetailsHandler(req('?slug=ghost'));

    expect(res.status).toBe(403);
    // No id to test a grant against, so no grant can be found — fail closed
    // rather than asking the staff table about `undefined`.
    expect(isCourseStaff).not.toHaveBeenCalled();
  });

  it('asks nothing of the staff table for a subscriber or an admin', async () => {
    await getCourseDetailsHandler(req());
    expect(isCourseStaff).not.toHaveBeenCalled();

    getUserRoleNames.mockResolvedValue(['admin']);
    isSubscribedToCourseSlug.mockResolvedValue(false);
    await getCourseDetailsHandler(req());
    expect(isCourseStaff).not.toHaveBeenCalled();
  });

  it('400s a signed-in request with no slug', async () => {
    const res = await getCourseDetailsHandler(req(''));

    expect(res.status).toBe(400);
    expect(getCourseDetailsWithCache).not.toHaveBeenCalled();
  });

  it('reads the same cached payload the server enforces against', async () => {
    await getCourseDetailsHandler(req());

    // The gate is a shared predicate but its inputs were not: the server read
    // getCourseDetailsWithCache (Redis) while this route read the uncached
    // getCourseDetails, and the browser then held that for 48h. After an admin
    // published a lesson or edited a dependency the sidebar and the server
    // could disagree in either direction — a row shown open that 403s, or a
    // row shown locked that opens.
    expect(getCourseDetailsWithCache).toHaveBeenCalledWith('c1');
    expect(getCourseDetails).not.toHaveBeenCalled();
  });
});
