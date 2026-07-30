import { describe, expect, it } from 'vitest';
import { computeLessonLocks } from '../compute-lesson-locks';

const details = {
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
          isAvailable: true,
          videoId: 'v1',
          needsVideoWatch: true,
          dependsOn: [],
        },
        {
          id: 11,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          videoId: 'v2',
          needsVideoWatch: true,
          dependsOn: [{ lessonSlug: 'a', moduleSlug: 'm1' }],
        },
      ],
    },
  ],
};

describe('computeLessonLocks', () => {
  it('locks a lesson whose prerequisite is unwatched', () => {
    const locks = computeLessonLocks(details, {
      lessons: [
        { lessonId: 10, watched: false },
        { lessonId: 11, watched: false },
      ],
    });
    expect(locks.b).toEqual({
      kind: 'lesson-locked',
      lessonSlug: 'a',
      moduleSlug: 'm1',
      lessonName: 'A',
    });
    expect(locks.a).toEqual({ kind: 'open' });
  });

  it('opens the lesson once the prerequisite is watched', () => {
    const locks = computeLessonLocks(details, {
      lessons: [
        { lessonId: 10, watched: true },
        { lessonId: 11, watched: false },
      ],
    });
    expect(locks.b).toEqual({ kind: 'open' });
  });

  it('returns an empty map when progress has not loaded', () => {
    expect(computeLessonLocks(details, undefined)).toEqual({});
  });
});
