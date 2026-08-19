import { describe, expect, it } from 'vitest';
import { watchedMilestones } from '#/lib/course-milestones';
import { resolveCardResume } from '../course-card-resume';

const lesson = (
  id: number,
  slug: string,
  dependsOn: { lessonSlug: string }[] = [],
) => ({
  id,
  slug,
  name: slug,
  isAvailable: true,
  hasVideo: true,
  needsVideoWatch: true,
  levels: [],
  dependsOn,
});

// Two lessons where the second is gated on finishing the first.
const details = {
  modules: [
    {
      id: 1,
      slug: 'navigation',
      name: 'Navigation',
      dependsOn: [],
      sequentialLessons: false,
      lessons: [
        lesson(1, 'pilotage'),
        lesson(2, 'dead-reckoning', [{ lessonSlug: 'pilotage' }]),
      ],
    },
  ],
};

describe('resolveCardResume', () => {
  it('does NOT treat a partially watched lesson as complete', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [{ lessonId: 1, watchedHits: 1 }],
      pointerLessonId: 2,
      level: 'basic',
      bypassLocks: false,
    });
    // Lesson 1 is unfinished, so lesson 2 is still locked and the pointer must
    // hop back to the blocker rather than land on a lock screen.
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'pilotage',
    });
  });

  it('treats a lesson as complete only when every milestone is hit', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [{ lessonId: 1, watchedHits: watchedMilestones.length }],
      pointerLessonId: 2,
      level: 'basic',
      bypassLocks: false,
    });
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'dead-reckoning',
    });
  });

  it('resolves the pointer id to its slug', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [],
      pointerLessonId: 1,
      level: 'basic',
      bypassLocks: false,
    });
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'pilotage',
    });
  });

  it('treats a pointer to a lesson no longer in the course as no pointer', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [],
      pointerLessonId: 9999,
      level: 'basic',
      bypassLocks: false,
    });
    // Falls back to the first open lesson rather than throwing.
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'pilotage',
    });
  });

  it('never links the card at an out-of-tier lesson the pilot has not completed', () => {
    // The /app grid is the other door into the redirect loop: the card links
    // straight to the lesson, so an out-of-tier target here sends the pilot to
    // a material 403 that bounces them back to /course/$slug.
    const mixed = {
      modules: [
        {
          ...details.modules[0],
          lessons: [
            { ...lesson(1, 'pilotage'), levels: ['basic'] },
            { ...lesson(2, 'dead-reckoning'), levels: ['intermediate'] },
          ],
        },
      ],
    };

    const result = resolveCardResume({
      details: mixed,
      lessonHits: [],
      pointerLessonId: null,
      level: 'intermediate',
      bypassLocks: false,
    });

    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'dead-reckoning',
    });
  });

  it('ignores locks for an admin', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [],
      pointerLessonId: 2,
      level: null,
      bypassLocks: true,
    });
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'dead-reckoning',
    });
  });
});
