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
    { lessonId: 1, levels: ['basic'], levelGated: true, isAvailable: true },
    { lessonId: 2, levels: [], levelGated: true, isAvailable: true },
    {
      lessonId: 3,
      levels: ['intermediate'],
      levelGated: true,
      isAvailable: true,
    },
    { lessonId: 4, levels: ['basic'], levelGated: true, isAvailable: false },
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

  it('is neither blocked nor earned by a lesson outside 3D Airmanship', () => {
    const withUas = [
      ...lessons,
      { lessonId: 9, levels: ['basic'], levelGated: false, isAvailable: true },
    ];
    // The unfinished UAS lesson is visible to the pilot, but is no tier's work.
    expect(
      isTierComplete({
        lessons: withUas,
        progress: [{ lessonId: 1, percent: 100 }],
        level: 'basic',
      }),
    ).toBe(true);
    // And on its own it makes no tier at all.
    expect(
      isTierComplete({
        lessons: [withUas[4]],
        progress: [{ lessonId: 9, percent: 100 }],
        level: 'basic',
      }),
    ).toBe(false);
  });

  it('does not count untagged lessons toward any tier', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          { lessonId: 1, percent: 100 },
          { lessonId: 2, percent: 40 },
        ],
        level: 'basic',
      }),
    ).toBe(true);
  });

  it('cannot be completed by untagged lessons alone', () => {
    expect(
      isTierComplete({
        lessons: [
          { lessonId: 2, levels: [], levelGated: true, isAvailable: true },
        ],
        progress: [{ lessonId: 2, percent: 100 }],
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
        lessons: [
          {
            lessonId: 9,
            levels: ['advanced'],
            levelGated: true,
            isAvailable: true,
          },
        ],
        progress: [{ lessonId: 9, percent: 100 }],
        level: 'basic',
      }),
    ).toBe(false);
  });
});

describe("isTierComplete — a 'none' lesson", () => {
  it('is not counted toward any tier, so an unfinished one never blocks', () => {
    for (const level of ['basic', 'intermediate', 'advanced'] as const) {
      expect(
        isTierComplete({
          lessons: [
            {
              lessonId: 1,
              levels: [level],
              levelGated: true,
              isAvailable: true,
            },
            {
              lessonId: 2,
              levels: ['none'],
              levelGated: true,
              isAvailable: true,
            },
          ],
          progress: [{ lessonId: 1, percent: 100 }],
          level,
        }),
      ).toBe(true);
    }
  });

  it('cannot complete a tier on its own', () => {
    expect(
      isTierComplete({
        lessons: [
          {
            lessonId: 2,
            levels: ['none'],
            levelGated: true,
            isAvailable: true,
          },
        ],
        progress: [{ lessonId: 2, percent: 100 }],
        level: 'basic',
      }),
    ).toBe(false);
  });
});
