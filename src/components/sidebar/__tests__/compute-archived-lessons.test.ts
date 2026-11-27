import { describe, expect, it } from 'vitest';
import { computeArchivedLessons } from '../compute-archived-lessons';

const course = {
  modules: [
    {
      slug: 'm1',
      lessons: [
        {
          id: 1,
          slug: 'basic-a',
          name: 'Basic A',
          levels: [],
          levelGated: true,
        },
        {
          id: 2,
          slug: 'basic-only',
          name: 'Basic Only',
          levels: ['basic'],
          levelGated: true,
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
          levelGated: true,
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

  it('does not archive another tier’s completed lesson: it is still open, as optional', () => {
    // 2026-11-27: promoted to intermediate, 'basic-only' stays in the tree as
    // an optional lesson, so it needs no archive entry to be reached.
    const archived = computeArchivedLessons(
      course,
      { lessons: [{ lessonId: 2, percent: 100 }] },
      'intermediate',
    );
    expect(archived).toEqual([]);
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

  it('does not archive a completed untagged lesson: it was never at any level', () => {
    // levels: [] is visible to no one under strict levels, but it was not
    // moved to another tier either — there is no earlier level it could be
    // the archive of.
    const archived = computeArchivedLessons(
      course,
      { lessons: [{ lessonId: 1, percent: 100 }] },
      'advanced',
    );
    expect(archived).toEqual([]);
  });

  it('archives nothing for a pilot with no level', () => {
    const archived = computeArchivedLessons(
      course,
      {
        lessons: [
          { lessonId: 2, percent: 100 },
          { lessonId: 3, percent: 100 },
        ],
      },
      null,
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

  it('archives nothing a pilot with a level can still open, in any module', () => {
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
    expect(archived).toEqual([]);
  });
});

describe("computeArchivedLessons — a lesson tagged 'none'", () => {
  it('is not archived even when the pilot completed it: None means withdrawn (and another tier’s lesson is simply open)', () => {
    const withdrawn = {
      modules: [
        {
          slug: 'm1',
          lessons: [
            {
              id: 9,
              slug: 'ditching',
              name: 'Ditching',
              levels: ['none'],
              levelGated: true,
            },
            {
              id: 2,
              slug: 'basic-only',
              name: 'Basic Only',
              levels: ['basic'],
              levelGated: true,
            },
          ],
        },
      ],
    };
    const progress = {
      lessons: [
        { lessonId: 9, percent: 100 },
        { lessonId: 2, percent: 100 },
      ],
    };
    expect(
      computeArchivedLessons(withdrawn, progress, 'intermediate').map(
        (l) => l.slug,
      ),
    ).toEqual([]);
  });
});
