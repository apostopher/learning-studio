import { describe, expect, it } from 'vitest';
import { computeArchivedLessons } from '../compute-archived-lessons';

const course = {
  modules: [
    {
      slug: 'm1',
      lessons: [
        { id: 1, slug: 'basic-a', name: 'Basic A', levels: [] },
        {
          id: 2,
          slug: 'basic-only',
          name: 'Basic Only',
          levels: ['basic'],
        },
      ],
    },
    {
      slug: 'm2',
      lessons: [
        {
          id: 3,
          slug: 'intermediate-a',
          name: 'Intermediate A',
          levels: ['intermediate'],
        },
      ],
    },
  ],
};

describe('computeArchivedLessons', () => {
  it('returns empty when course or progress is missing', () => {
    expect(computeArchivedLessons(undefined, { lessons: [] }, 'basic')).toEqual(
      [],
    );
    expect(computeArchivedLessons(course, undefined, 'basic')).toEqual([]);
    expect(computeArchivedLessons(null, null, 'basic')).toEqual([]);
  });

  it('archives a completed lesson that is out of tier at the current level', () => {
    // Promoted to intermediate: 'basic-only' (levels: ['basic']) is no longer
    // visible, and was completed.
    const archived = computeArchivedLessons(
      course,
      { lessons: [{ lessonId: 2, percent: 100 }] },
      'intermediate',
    );
    expect(archived).toEqual([
      { slug: 'basic-only', moduleSlug: 'm1', name: 'Basic Only' },
    ]);
  });

  it('does not archive an out-of-tier lesson that was never completed', () => {
    const archived = computeArchivedLessons(
      course,
      { lessons: [{ lessonId: 2, percent: 40 }] },
      'intermediate',
    );
    expect(archived).toEqual([]);
  });

  it('does not archive a lesson with no progress row at all', () => {
    const archived = computeArchivedLessons(
      course,
      { lessons: [] },
      'intermediate',
    );
    expect(archived).toEqual([]);
  });

  it('does not archive a lesson that is still visible at the current level (levels: [] means every tier)', () => {
    const archived = computeArchivedLessons(
      course,
      { lessons: [{ lessonId: 1, percent: 100 }] },
      'advanced',
    );
    expect(archived).toEqual([]);
  });

  it('does not archive a lesson that belongs to the current level exactly', () => {
    const archived = computeArchivedLessons(
      course,
      { lessons: [{ lessonId: 3, percent: 100 }] },
      'intermediate',
    );
    expect(archived).toEqual([]);
  });

  it('archives across multiple modules, carrying each lesson’s own moduleSlug', () => {
    const archived = computeArchivedLessons(
      course,
      {
        lessons: [
          { lessonId: 2, percent: 100 },
          { lessonId: 3, percent: 100 },
        ],
      },
      'advanced',
    );
    expect(archived).toEqual([
      { slug: 'basic-only', moduleSlug: 'm1', name: 'Basic Only' },
      { slug: 'intermediate-a', moduleSlug: 'm2', name: 'Intermediate A' },
    ]);
  });
});
