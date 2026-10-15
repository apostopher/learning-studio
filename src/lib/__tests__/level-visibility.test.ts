import { describe, expect, it } from 'vitest';
import {
  filterCourseToLevel,
  isLessonVisibleAtLevel,
} from '#/lib/level-visibility';

describe('isLessonVisibleAtLevel', () => {
  it('hides an untagged lesson from every tier', () => {
    expect(isLessonVisibleAtLevel([], 'basic')).toBe(false);
    expect(isLessonVisibleAtLevel([], 'intermediate')).toBe(false);
    expect(isLessonVisibleAtLevel([], 'advanced')).toBe(false);
  });

  it('shows a pilot with no level nothing at all', () => {
    expect(isLessonVisibleAtLevel(['basic'], null)).toBe(false);
    expect(isLessonVisibleAtLevel(['basic', 'advanced'], null)).toBe(false);
    expect(isLessonVisibleAtLevel([], null)).toBe(false);
    expect(isLessonVisibleAtLevel(['none'], null)).toBe(false);
  });

  it('matches exactly — advanced does not inherit basic', () => {
    expect(isLessonVisibleAtLevel(['basic'], 'advanced')).toBe(false);
    expect(isLessonVisibleAtLevel(['basic'], 'basic')).toBe(true);
  });

  it('honours a multi-tier tag', () => {
    const tag = ['intermediate', 'advanced'];
    expect(isLessonVisibleAtLevel(tag, 'basic')).toBe(false);
    expect(isLessonVisibleAtLevel(tag, 'intermediate')).toBe(true);
    expect(isLessonVisibleAtLevel(tag, 'advanced')).toBe(true);
  });
});

describe('filterCourseToLevel', () => {
  const course = {
    modules: [
      {
        slug: 'm1',
        lessons: [
          { slug: 'a', levels: ['basic'] },
          { slug: 'b', levels: [] },
          { slug: 'c', levels: ['intermediate'] },
        ],
      },
      {
        slug: 'm2',
        lessons: [{ slug: 'd', levels: ['basic'] }],
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
    expect(isLessonVisibleAtLevel(['none'], 'basic')).toBe(false);
    expect(isLessonVisibleAtLevel(['none'], 'intermediate')).toBe(false);
    expect(isLessonVisibleAtLevel(['none'], 'advanced')).toBe(false);
  });

  it('is dropped by filterCourseToLevel at every level, as is []', () => {
    const course = {
      modules: [
        {
          slug: 'm1',
          lessons: [
            { slug: 'hidden', levels: ['none'] },
            { slug: 'untagged', levels: [] },
            { slug: 'everyone', levels: ['basic', 'intermediate', 'advanced'] },
          ],
        },
        { slug: 'm2', lessons: [{ slug: 'only-none', levels: ['none'] }] },
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
