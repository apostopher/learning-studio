import { describe, expect, it } from 'vitest';
import {
  filterCourseToLevel,
  isLessonVisibleAtLevel,
} from '#/lib/level-visibility';

describe('isLessonVisibleAtLevel', () => {
  it('shows an untagged lesson to every tier', () => {
    expect(isLessonVisibleAtLevel([], 'basic')).toBe(true);
    expect(isLessonVisibleAtLevel([], 'intermediate')).toBe(true);
    expect(isLessonVisibleAtLevel([], 'advanced')).toBe(true);
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

  it('keeps only lessons visible at the level', () => {
    const filtered = filterCourseToLevel(course, 'intermediate');
    expect(filtered.modules[0].lessons.map((l) => l.slug)).toEqual(['b', 'c']);
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
