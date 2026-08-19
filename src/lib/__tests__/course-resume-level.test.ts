import { describe, expect, it } from 'vitest';
import { resolveResumeTargetForLevel } from '#/lib/course-resume-level';

const lesson = (
  id: number,
  slug: string,
  levels: string[],
  dependsOn: { lessonSlug: string }[] = [],
) => ({
  id,
  slug,
  name: slug,
  isAvailable: true,
  hasVideo: true,
  needsVideoWatch: true,
  levels,
  dependsOn,
});

/**
 * A mixed-tier module: the Basic lesson sorts FIRST, which is what makes it
 * `firstOpen()`'s answer for every pilot when nothing filters the course.
 */
const details = {
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'Module One',
      dependsOn: [],
      sequentialLessons: false,
      lessons: [
        lesson(1, 'basic-intro', ['basic']),
        lesson(2, 'inter-core', ['intermediate']),
      ],
    },
  ],
};

const INTER_CORE = {
  kind: 'lesson',
  moduleSlug: 'm1',
  lessonSlug: 'inter-core',
};
const BASIC_INTRO = {
  kind: 'lesson',
  moduleSlug: 'm1',
  lessonSlug: 'basic-intro',
};

/**
 * These tests reproduce the redirect loop the resume path shipped with.
 *
 * `/course/$slug` asks for a resume target, redirects to it, the lesson page
 * asks `/api/lesson/material`, that 403s `out-of-tier`, and the lesson page
 * navigates back to `/course/$slug`. Both answers are cached, so after the
 * first pass the loop spins with no network at all.
 *
 * Every case therefore asserts the TARGET HANDED BACK, not that a filter ran:
 * the only thing that keeps the browser out of the loop is which lesson the
 * redirect names.
 */
describe('resolveResumeTargetForLevel', () => {
  it('never resumes into an out-of-tier lesson the pilot has not completed', () => {
    const result = resolveResumeTargetForLevel({
      details,
      watched: new Set<string>(),
      pointerLessonId: null,
      level: 'intermediate',
      bypassLocks: false,
    });

    // Unfiltered, `firstOpen()` answers 'basic-intro' — a lesson this pilot
    // cannot open, and the first step of the loop.
    expect(result).toEqual(INTER_CORE);
  });

  it('falls through a pointer parked on an out-of-tier lesson instead of resuming into the archive', () => {
    // Exactly the post-promotion state: the pointer is the lesson they just
    // finished, which the promotion has now moved out of tier. It opens
    // read-only, so nothing 403s — but landing there is the "your course was
    // rearranged and you were sent backwards" reading that §5 exists to stop.
    const result = resolveResumeTargetForLevel({
      details,
      watched: new Set(['basic-intro']),
      pointerLessonId: 1,
      level: 'intermediate',
      bypassLocks: false,
    });

    expect(result).toEqual(INTER_CORE);
  });

  it('does not let a hidden lesson gate a visible one', () => {
    const chained = {
      modules: [
        {
          ...details.modules[0],
          lessons: [
            lesson(1, 'basic-intro', ['basic']),
            lesson(
              2,
              'inter-core',
              ['intermediate'],
              [{ lessonSlug: 'basic-intro' }],
            ),
          ],
        },
      ],
    };

    const result = resolveResumeTargetForLevel({
      details: chained,
      watched: new Set<string>(),
      pointerLessonId: null,
      level: 'intermediate',
      bypassLocks: false,
    });

    // Unfiltered, 'inter-core' is lesson-locked behind an unwatched
    // 'basic-intro' and the pilot is deposited on the blocker they cannot open.
    expect(result).toEqual(INTER_CORE);
  });

  it('re-chains a sequential module around the lessons filtering removed', () => {
    const locked = {
      modules: [
        {
          ...details.modules[0],
          sequentialLessons: true,
          lessons: [
            lesson(1, 'basic-intro', ['basic']),
            lesson(2, 'inter-one', ['intermediate']),
            lesson(3, 'inter-two', ['intermediate']),
          ],
        },
      ],
    };

    const result = resolveResumeTargetForLevel({
      details: locked,
      watched: new Set<string>(),
      pointerLessonId: null,
      level: 'intermediate',
      bypassLocks: false,
    });

    // The chain within the filtered module still applies: 'inter-one' has
    // nothing before it once the Basic lesson is gone, so it opens.
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'm1',
      lessonSlug: 'inter-one',
    });
  });

  it('filters nothing for an admin, who has no tier', () => {
    const result = resolveResumeTargetForLevel({
      details,
      watched: new Set<string>(),
      pointerLessonId: null,
      level: null,
      bypassLocks: true,
    });

    expect(result).toEqual(BASIC_INTRO);
  });

  it('still resumes an in-tier pointer', () => {
    const result = resolveResumeTargetForLevel({
      details,
      watched: new Set<string>(),
      pointerLessonId: 1,
      level: 'basic',
      bypassLocks: false,
    });

    expect(result).toEqual(BASIC_INTRO);
  });

  it('reports no-lessons when the pilot can see nothing in the course', () => {
    const result = resolveResumeTargetForLevel({
      details,
      watched: new Set<string>(),
      pointerLessonId: null,
      level: 'advanced',
      bypassLocks: false,
    });

    expect(result).toEqual({ kind: 'none', reason: 'no-lessons' });
  });
});
