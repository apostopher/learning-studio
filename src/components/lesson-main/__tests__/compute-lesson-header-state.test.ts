import { describe, expect, it } from 'vitest';
import { computeLessonHeaderState } from '../compute-lesson-header-state';

const baseCourse = {
  modules: [
    {
      slug: 'm-1',
      lessons: [{ slug: 'l-1', name: 'Lesson One', videoId: 'v1' }],
    },
  ],
};

describe('computeLessonHeaderState', () => {
  it('returns loading when course is loading', () => {
    expect(
      computeLessonHeaderState({
        course: { data: undefined, isLoading: true, isError: false },
        moduleSlug: 'm-1',
        lessonSlug: 'l-1',
      }),
    ).toEqual({ kind: 'loading' });
  });

  it('returns idle when course errored', () => {
    expect(
      computeLessonHeaderState({
        course: { data: undefined, isLoading: false, isError: true },
        moduleSlug: 'm-1',
        lessonSlug: 'l-1',
      }),
    ).toEqual({ kind: 'idle' });
  });

  it('returns idle when lesson not found', () => {
    expect(
      computeLessonHeaderState({
        course: { data: baseCourse, isLoading: false, isError: false },
        moduleSlug: 'm-1',
        lessonSlug: 'missing',
      }),
    ).toEqual({ kind: 'idle' });
  });

  it('returns title with lesson name when lesson found', () => {
    expect(
      computeLessonHeaderState({
        course: { data: baseCourse, isLoading: false, isError: false },
        moduleSlug: 'm-1',
        lessonSlug: 'l-1',
      }),
    ).toEqual({ kind: 'title', name: 'Lesson One' });
  });
});
