// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '#/hooks/data/keys';
import { fetchLessonMaterial } from '../lesson-material';

afterEach(() => vi.restoreAllMocks());

const unlockedBody = { locked: false, adminBypass: false, material: null };

describe('fetchLessonMaterial', () => {
  // This is the exact function `lessonMaterialAtomFamily`'s `queryFn` calls
  // — jotai-tanstack-query atoms cannot be rendered under this repo's Vitest
  // setup, so exercising the real fetch is the closest this suite gets to
  // the atom's own request, and still catches a regression in it.
  it('names the course the route is on, so the server gates for THAT course', async () => {
    // /api/lesson/material 400s without `courseSlug` and, with it, evaluates
    // the gate for the lesson INSIDE that course (Task 6a). The whole URL is
    // asserted so a renamed or dropped param cannot pass on a substring.
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => unlockedBody });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLessonMaterial({
      courseSlug: 'course-b',
      lessonSlug: 'l-1',
    });

    expect(result).toEqual(unlockedBody);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/lesson/material?lessonSlug=l-1&courseSlug=course-b',
    );
  });

  it('rejects on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    await expect(
      fetchLessonMaterial({ courseSlug: 'c', lessonSlug: 'l' }),
    ).rejects.toThrow();
  });
});

describe('lessonMaterial query key', () => {
  it('is distinct per course for the same lesson slug', () => {
    // The material response carries the gate's answer — locked, read-only,
    // out-of-tier — which is per course. Sharing one entry across courses
    // would show course B's learner course A's lock screen.
    expect(
      queryKeys.lessonMaterial({ courseSlug: 'a', lessonSlug: 'l' }),
    ).not.toEqual(
      queryKeys.lessonMaterial({ courseSlug: 'b', lessonSlug: 'l' }),
    );
  });
});
