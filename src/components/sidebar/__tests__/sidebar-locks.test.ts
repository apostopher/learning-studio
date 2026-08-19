import { describe, expect, it } from 'vitest';
import { computeLessonLocks } from '../compute-lesson-locks';

const details = {
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'M1',
      dependsOn: [],
      sequentialLessons: false,
      lessons: [
        {
          id: 10,
          slug: 'a',
          name: 'A',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          levels: [],
          dependsOn: [],
        },
        {
          id: 11,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          levels: [],
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

  it('shows an admin no locks at all, because every row opens for them', () => {
    // Admins bypass all three gates server-side, so a locked row in their
    // sidebar was a lie in the permissive direction: they clicked it and it
    // opened. Same inputs as the first test, which proves 'b' would otherwise
    // be locked here.
    const progress = {
      lessons: [
        { lessonId: 10, watched: false },
        { lessonId: 11, watched: false },
      ],
    };
    expect(computeLessonLocks(details, progress, false).b).toMatchObject({
      kind: 'lesson-locked',
    });
    expect(computeLessonLocks(details, progress, true)).toEqual({});
  });
});
