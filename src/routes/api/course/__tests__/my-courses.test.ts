// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getMyCourses } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getMyCourses: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/course', () => ({ getMyCourses }));

import { getMyCoursesHandler } from '../my-courses';

const courses = [
  {
    id: 1,
    name: '3D Airmanship',
    slug: '3d-airmanship',
    imageUrlAvif: null,
    imageUrlWebp: null,
    percent: 42,
    resume: {
      kind: 'lesson',
      moduleSlug: 'ground-school',
      lessonSlug: 'weight-and-balance',
    },
  },
  {
    id: 2,
    name: 'Instrument Rating',
    slug: 'instrument-rating',
    imageUrlAvif: null,
    imageUrlWebp: null,
    percent: 0,
    resume: { kind: 'none', reason: 'no-lessons' },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  getMyCourses.mockResolvedValue(courses);
});

describe('getMyCoursesHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await getMyCoursesHandler(
      new Request('http://test/api/course/my-courses'),
    );
    expect(res.status).toBe(401);
    expect(getMyCourses).not.toHaveBeenCalled();
  });

  it("returns the caller's own courses, scoped by session user id", async () => {
    const res = await getMyCoursesHandler(
      new Request('http://test/api/course/my-courses'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(courses);
    expect(getMyCourses).toHaveBeenCalledWith('user-1');
  });

  it('500 with a JSON error body when the query throws', async () => {
    getMyCourses.mockRejectedValueOnce(new Error('db down'));
    const res = await getMyCoursesHandler(
      new Request('http://test/api/course/my-courses'),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load courses' });
  });
});
