import { describe, expect, it } from 'vitest';
import {
  courseHasAvailableLessons,
  filterCourseToLevel,
  isLessonArchivable,
  isLessonAtTier,
  isLessonVisibleAtLevel,
} from '#/lib/level-visibility';

/** A 3D Airmanship lesson: the only kind levels apply to. */
const gated = (levels: string[]) => ({ levels, levelGated: true });
/** A lesson of any other discipline. */
const ungated = (levels: string[]) => ({ levels, levelGated: false });

describe('isLessonVisibleAtLevel', () => {
  it('hides an untagged lesson from every tier', () => {
    expect(isLessonVisibleAtLevel(gated([]), 'basic')).toBe(false);
    expect(isLessonVisibleAtLevel(gated([]), 'intermediate')).toBe(false);
    expect(isLessonVisibleAtLevel(gated([]), 'advanced')).toBe(false);
  });

  it('shows a pilot with no level nothing at all', () => {
    expect(isLessonVisibleAtLevel(gated(['basic']), null)).toBe(false);
    expect(isLessonVisibleAtLevel(gated(['basic', 'advanced']), null)).toBe(
      false,
    );
    expect(isLessonVisibleAtLevel(gated([]), null)).toBe(false);
    expect(isLessonVisibleAtLevel(gated(['none']), null)).toBe(false);
  });

  it('matches exactly — advanced does not inherit basic', () => {
    expect(isLessonVisibleAtLevel(gated(['basic']), 'advanced')).toBe(false);
    expect(isLessonVisibleAtLevel(gated(['basic']), 'basic')).toBe(true);
  });

  it('honours a multi-tier tag', () => {
    const tag = ['intermediate', 'advanced'];
    expect(isLessonVisibleAtLevel(gated(tag), 'basic')).toBe(false);
    expect(isLessonVisibleAtLevel(gated(tag), 'intermediate')).toBe(true);
    expect(isLessonVisibleAtLevel(gated(tag), 'advanced')).toBe(true);
  });
});

describe('filterCourseToLevel', () => {
  const course = {
    modules: [
      {
        slug: 'm1',
        lessons: [
          { slug: 'a', levels: ['basic'], levelGated: true },
          { slug: 'b', levels: [], levelGated: true },
          { slug: 'c', levels: ['intermediate'], levelGated: true },
        ],
      },
      {
        slug: 'm2',
        lessons: [{ slug: 'd', levels: ['basic'], levelGated: true }],
      },
    ],
  };

  it('keeps only lessons tagged with exactly that level', () => {
    const filtered = filterCourseToLevel(course, 'intermediate');
    expect(filtered.modules[0].lessons.map((l) => l.slug)).toEqual(['c']);
  });

  it('leaves a pilot with no level an empty course', () => {
    expect(filterCourseToLevel(course, null).modules).toEqual([]);
  });

  it('drops a module with no visible lessons entirely', () => {
    const filtered = filterCourseToLevel(course, 'intermediate');
    expect(filtered.modules.map((m) => m.slug)).toEqual(['m1']);
  });

  it('does not mutate the input', () => {
    filterCourseToLevel(course, 'advanced');
    expect(course.modules).toHaveLength(2);
    expect(course.modules[0].lessons).toHaveLength(3);
  });
});

describe("the 'none' tag", () => {
  it('hides the lesson at every learner level', () => {
    expect(isLessonVisibleAtLevel(gated(['none']), 'basic')).toBe(false);
    expect(isLessonVisibleAtLevel(gated(['none']), 'intermediate')).toBe(false);
    expect(isLessonVisibleAtLevel(gated(['none']), 'advanced')).toBe(false);
  });

  it('is dropped by filterCourseToLevel at every level, as is []', () => {
    const course = {
      modules: [
        {
          slug: 'm1',
          lessons: [
            { slug: 'hidden', levels: ['none'], levelGated: true },
            { slug: 'untagged', levels: [], levelGated: true },
            {
              slug: 'everyone',
              levels: ['basic', 'intermediate', 'advanced'],
              levelGated: true,
            },
          ],
        },
        {
          slug: 'm2',
          lessons: [{ slug: 'only-none', levels: ['none'], levelGated: true }],
        },
      ],
    };
    for (const level of ['basic', 'intermediate', 'advanced'] as const) {
      const filtered = filterCourseToLevel(course, level);
      expect(filtered.modules.map((m) => m.slug)).toEqual(['m1']);
      expect(filtered.modules[0].lessons.map((l) => l.slug)).toEqual([
        'everyone',
      ]);
    }
  });
});

describe('courseHasAvailableLessons', () => {
  it('is true when any module holds an available lesson', () => {
    expect(
      courseHasAvailableLessons({
        modules: [{ lessons: [] }, { lessons: [{ isAvailable: true }] }],
      }),
    ).toBe(true);
  });

  it('is false for a course with no lessons, or only unavailable ones', () => {
    expect(courseHasAvailableLessons({ modules: [] })).toBe(false);
    expect(
      courseHasAvailableLessons({
        modules: [{ lessons: [{ isAvailable: false }] }],
      }),
    ).toBe(false);
  });
});

describe('a lesson outside 3D Airmanship', () => {
  it('is visible at every level, and to a pilot with none, whatever its tags', () => {
    for (const level of ['basic', 'intermediate', 'advanced', null] as const) {
      for (const tags of [[], ['basic'], ['none']]) {
        expect(isLessonVisibleAtLevel(ungated(tags), level)).toBe(true);
      }
    }
  });

  it('belongs to no tier and is never archived', () => {
    expect(isLessonAtTier(ungated(['basic']), 'basic')).toBe(false);
    expect(isLessonArchivable(ungated(['basic']))).toBe(false);
    expect(isLessonAtTier(gated(['basic']), 'basic')).toBe(true);
    expect(isLessonArchivable(gated(['basic']))).toBe(true);
  });

  it('is all that is left for a pilot with no level', () => {
    const course = {
      modules: [
        {
          slug: 'uas',
          lessons: [
            { slug: 'uas-1', levels: [], levelGated: false },
            { slug: '3da-1', levels: ['basic'], levelGated: true },
          ],
        },
        {
          slug: '3da',
          lessons: [{ slug: '3da-2', levels: ['basic'], levelGated: true }],
        },
      ],
    };
    const { modules } = filterCourseToLevel(course, null);
    expect(modules.map((m) => [m.slug, m.lessons.map((l) => l.slug)])).toEqual([
      ['uas', ['uas-1']],
    ]);
  });

  it('is gated when the payload does not say: an entry from before the field', () => {
    const stale = { levels: [] } as unknown as ReturnType<typeof gated>;
    expect(isLessonVisibleAtLevel(stale, 'basic')).toBe(false);
  });
});
