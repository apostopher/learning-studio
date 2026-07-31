import { describe, expect, it } from 'vitest';
import { findLesson } from '../find-lesson';

const fixture = {
  modules: [
    {
      slug: 'mod-a',
      lessons: [
        { slug: 'l-1', name: 'Lesson One', hasVideo: true },
        { slug: 'l-2', name: 'Lesson Two', hasVideo: false },
      ],
    },
    {
      slug: 'mod-b',
      lessons: [{ slug: 'l-3', name: 'Lesson Three', hasVideo: true }],
    },
  ],
};

describe('findLesson', () => {
  it('returns the lesson when module and lesson slugs match', () => {
    const lesson = findLesson(fixture, 'mod-a', 'l-2');
    expect(lesson?.name).toBe('Lesson Two');
    expect(lesson?.hasVideo).toBe(false);
  });

  it('returns undefined when the module slug does not exist', () => {
    expect(findLesson(fixture, 'mod-z', 'l-1')).toBeUndefined();
  });

  it('returns undefined when the lesson slug does not exist in the module', () => {
    expect(findLesson(fixture, 'mod-a', 'l-3')).toBeUndefined();
  });

  it('returns undefined when course is undefined', () => {
    expect(findLesson(undefined, 'mod-a', 'l-1')).toBeUndefined();
  });
});
