import { describe, expect, it } from 'vitest';
import {
  evaluateLessonLock,
  evaluateMaterialLock,
  type GateCourse,
  type GateLesson,
  isLessonSatisfied,
  lockedResponse,
} from '#/lib/lesson-gating';

const lesson = (over: Partial<GateLesson> = {}): GateLesson => ({
  slug: 'l1',
  name: 'Lesson One',
  isAvailable: true,
  hasVideo: true,
  needsVideoWatch: true,
  dependsOn: [],
  ...over,
});

const course = (modules: GateCourse['modules']): GateCourse => ({ modules });

describe('isLessonSatisfied', () => {
  it('is satisfied once the video is watched', () => {
    expect(isLessonSatisfied(lesson(), new Set(['l1']))).toBe(true);
    expect(isLessonSatisfied(lesson(), new Set())).toBe(false);
  });

  it('is satisfied when the lesson has no video', () => {
    // 20 lessons carry needsVideoWatch: true with no video, and the column
    // defaults to true — a hard block would strand them permanently.
    expect(isLessonSatisfied(lesson({ hasVideo: false }), new Set())).toBe(
      true,
    );
  });

  it('is satisfied when watching is not required', () => {
    expect(
      isLessonSatisfied(lesson({ needsVideoWatch: false }), new Set()),
    ).toBe(true);
  });

  it('is satisfied when the lesson is unavailable (WIP)', () => {
    expect(isLessonSatisfied(lesson({ isAvailable: false }), new Set())).toBe(
      true,
    );
  });
});

describe('evaluateLessonLock', () => {
  const twoModules = course([
    {
      slug: 'm1',
      name: 'Module One',
      dependsOn: [],
      sequentialLessons: false,
      lessons: [lesson({ slug: 'a', name: 'A' })],
    },
    {
      slug: 'm2',
      name: 'Module Two',
      dependsOn: ['m1'],
      sequentialLessons: false,
      lessons: [
        lesson({
          slug: 'b',
          name: 'B',
          dependsOn: [{ lessonSlug: 'a', moduleSlug: 'm1' }],
        }),
      ],
    },
  ]);

  it('locks on the module gate before the lesson gate', () => {
    expect(evaluateLessonLock(twoModules, 'b', new Set())).toEqual({
      kind: 'module-locked',
      moduleSlug: 'm1',
      moduleName: 'Module One',
    });
  });

  it('opens once every available lesson of the prerequisite module is satisfied', () => {
    expect(evaluateLessonLock(twoModules, 'b', new Set(['a']))).toEqual({
      kind: 'open',
    });
  });

  it('names the blocking lesson when only the lesson gate fails', () => {
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        sequentialLessons: false,
        lessons: [
          lesson({ slug: 'a', name: 'A' }),
          lesson({ slug: 'b', name: 'B', dependsOn: [{ lessonSlug: 'a' }] }),
        ],
      },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set())).toEqual({
      kind: 'lesson-locked',
      lessonSlug: 'a',
      moduleSlug: 'm1',
      lessonName: 'A',
    });
  });

  it('ignores a prerequisite that is unavailable', () => {
    // swiss-cheese depends on personal-accountability, which is is_available
    // false — a student can never reach it, so it must not block.
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        sequentialLessons: false,
        lessons: [
          lesson({ slug: 'a', name: 'A', isAvailable: false }),
          lesson({ slug: 'b', name: 'B', dependsOn: [{ lessonSlug: 'a' }] }),
        ],
      },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set())).toEqual({ kind: 'open' });
  });

  it('ignores a prerequisite lesson or module that does not exist', () => {
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: ['gone'],
        sequentialLessons: false,
        lessons: [
          lesson({
            slug: 'b',
            name: 'B',
            dependsOn: [{ lessonSlug: 'missing' }],
          }),
        ],
      },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set())).toEqual({ kind: 'open' });
  });

  it('resolves a same-module dependency with no moduleSlug', () => {
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        sequentialLessons: false,
        lessons: [
          lesson({ slug: 'a', name: 'A' }),
          lesson({ slug: 'b', name: 'B', dependsOn: [{ lessonSlug: 'a' }] }),
        ],
      },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set(['a']))).toEqual({
      kind: 'open',
    });
  });

  it('ignores unavailable lessons when judging a prerequisite module', () => {
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        sequentialLessons: false,
        lessons: [
          lesson({ slug: 'a', name: 'A' }),
          lesson({ slug: 'wip', name: 'WIP', isAvailable: false }),
        ],
      },
      {
        slug: 'm2',
        name: 'Module Two',
        dependsOn: ['m1'],
        sequentialLessons: false,
        lessons: [lesson({ slug: 'b', name: 'B' })],
      },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set(['a']))).toEqual({
      kind: 'open',
    });
  });
});

describe('evaluateMaterialLock', () => {
  const c = course([
    {
      slug: 'm1',
      name: 'Module One',
      dependsOn: [],
      sequentialLessons: false,
      lessons: [lesson({ slug: 'a', name: 'A' })],
    },
  ]);

  it('locks material until the lesson video is watched', () => {
    expect(evaluateMaterialLock(c, 'a', new Set())).toEqual({
      kind: 'video-locked',
    });
    expect(evaluateMaterialLock(c, 'a', new Set(['a']))).toEqual({
      kind: 'open',
    });
  });
});

describe('lockedResponse', () => {
  it('reports the module gate as the reason', () => {
    expect(
      lockedResponse(
        { kind: 'module-locked', moduleSlug: 'm1', moduleName: 'M' },
        { kind: 'open' },
      ),
    ).toEqual({
      locked: true,
      reason: 'module',
      blockedBy: { moduleSlug: 'm1', moduleName: 'M' },
    });
  });

  it('reports the lesson gate as the reason', () => {
    expect(
      lockedResponse(
        {
          kind: 'lesson-locked',
          lessonSlug: 'a',
          moduleSlug: 'm1',
          lessonName: 'A',
        },
        { kind: 'open' },
      ),
    ).toEqual({
      locked: true,
      reason: 'lesson',
      blockedBy: { lessonSlug: 'a', moduleSlug: 'm1', lessonName: 'A' },
    });
  });

  it('reports the video gate only when the lesson itself is open', () => {
    expect(lockedResponse({ kind: 'open' }, { kind: 'video-locked' })).toEqual({
      locked: true,
      reason: 'video',
    });
  });

  it('returns null when nothing is locked', () => {
    expect(lockedResponse({ kind: 'open' }, { kind: 'open' })).toBeNull();
  });
});
