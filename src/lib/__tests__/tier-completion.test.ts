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
          {
            lessonId: 1,
            done: true,
            debrief: { bearing: false, passed: false },
          },
          {
            lessonId: 2,
            done: true,
            debrief: { bearing: false, passed: false },
          },
          {
            lessonId: 3,
            done: false,
            debrief: { bearing: false, passed: false },
          },
        ],
        level: 'basic',
      }),
    ).toBe(true);
  });

  it('is neither blocked nor earned by a lesson outside 3D Airmanship', () => {
    const uas = {
      lessonId: 9,
      levels: ['basic'],
      levelGated: false,
      isAvailable: true,
    };
    const done = (lessonId: number) => ({
      lessonId,
      done: true,
      debrief: { bearing: false, passed: false },
    });
    expect(
      isTierComplete({
        lessons: [...lessons, uas],
        progress: [done(1)],
        level: 'basic',
      }),
    ).toBe(true);
    expect(
      isTierComplete({ lessons: [uas], progress: [done(9)], level: 'basic' }),
    ).toBe(false);
  });

  it('does not count untagged lessons toward any tier', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          {
            lessonId: 1,
            done: true,
            debrief: { bearing: false, passed: false },
          },
          {
            lessonId: 2,
            done: false,
            debrief: { bearing: false, passed: false },
          },
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
        progress: [
          {
            lessonId: 2,
            done: true,
            debrief: { bearing: false, passed: false },
          },
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
          {
            lessonId: 1,
            done: true,
            debrief: { bearing: false, passed: false },
          },
          {
            lessonId: 2,
            done: true,
            debrief: { bearing: false, passed: false },
          },
          {
            lessonId: 4,
            done: false,
            debrief: { bearing: false, passed: false },
          },
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
        progress: [
          {
            lessonId: 9,
            done: true,
            debrief: { bearing: false, passed: false },
          },
        ],
        level: 'basic',
      }),
    ).toBe(false);
  });
});

describe('isTierComplete — debriefs', () => {
  const lessons = [
    { lessonId: 1, levels: ['basic'], levelGated: true, isAvailable: true },
  ];

  it('is incomplete while a bearing debrief is unpassed', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          {
            lessonId: 1,
            done: true,
            debrief: { bearing: true, passed: false },
          },
        ],
        level: 'basic',
      }),
    ).toBe(false);
  });

  it('is complete when done and the bearing debrief is passed', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          { lessonId: 1, done: true, debrief: { bearing: true, passed: true } },
        ],
        level: 'basic',
      }),
    ).toBe(true);
  });

  it('needs only done for a non-bearing lesson', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          {
            lessonId: 1,
            done: true,
            debrief: { bearing: false, passed: false },
          },
        ],
        level: 'basic',
      }),
    ).toBe(true);
  });

  it('uses done, not percent', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          {
            lessonId: 1,
            done: false,
            debrief: { bearing: false, passed: false },
          },
        ],
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
          progress: [
            {
              lessonId: 1,
              done: true,
              debrief: { bearing: false, passed: false },
            },
          ],
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
        progress: [
          {
            lessonId: 2,
            done: true,
            debrief: { bearing: false, passed: false },
          },
        ],
        level: 'basic',
      }),
    ).toBe(false);
  });
});
