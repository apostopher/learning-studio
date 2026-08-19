import { describe, expect, it } from 'vitest';
import { isTierComplete, nextLevel } from '#/lib/tier-completion';

describe('nextLevel', () => {
  it('walks the ladder one rung at a time', () => {
    expect(nextLevel('basic')).toBe('intermediate');
    expect(nextLevel('intermediate')).toBe('advanced');
  });

  it('has nothing above advanced', () => {
    expect(nextLevel('advanced')).toBeNull();
  });
});

describe('isTierComplete', () => {
  const lessons = [
    { lessonId: 1, levels: ['basic'], isAvailable: true },
    { lessonId: 2, levels: [], isAvailable: true },
    { lessonId: 3, levels: ['intermediate'], isAvailable: true },
    { lessonId: 4, levels: ['basic'], isAvailable: false },
  ];

  it('is true when every reachable lesson at the tier is 100%', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          { lessonId: 1, percent: 100 },
          { lessonId: 2, percent: 100 },
          { lessonId: 3, percent: 0 },
        ],
        level: 'basic',
      }),
    ).toBe(true);
  });

  it('counts untagged lessons into the current tier', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          { lessonId: 1, percent: 100 },
          { lessonId: 2, percent: 40 },
        ],
        level: 'basic',
      }),
    ).toBe(false);
  });

  it('ignores unavailable lessons, so WIP content cannot deadlock a pilot', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          { lessonId: 1, percent: 100 },
          { lessonId: 2, percent: 100 },
          { lessonId: 4, percent: 0 },
        ],
        level: 'basic',
      }),
    ).toBe(true);
  });

  it('treats a lesson with no progress row as incomplete', () => {
    expect(isTierComplete({ lessons, progress: [], level: 'basic' })).toBe(
      false,
    );
  });

  it('is false when the tier has no reachable lessons at all', () => {
    expect(
      isTierComplete({
        lessons: [{ lessonId: 9, levels: ['advanced'], isAvailable: true }],
        progress: [{ lessonId: 9, percent: 100 }],
        level: 'basic',
      }),
    ).toBe(false);
  });
});
