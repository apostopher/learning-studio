import { describe, expect, it } from 'vitest';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import {
  evaluateLessonLock,
  evaluateMaterialLock,
  type GateCourse,
  type GateLesson,
  type GateProgress,
  isLessonSatisfied,
  isMaterialReadOnly,
  lockedResponse,
} from '#/lib/lesson-gating';

const lesson = (over: Partial<GateLesson> = {}): GateLesson => ({
  slug: 'l1',
  name: 'Lesson One',
  isAvailable: true,
  hasVideo: true,
  needsVideoWatch: true,
  levels: [],
  dependsOn: [],
  ...over,
});

const course = (modules: GateCourse['modules']): GateCourse => ({ modules });

/** Progress for the predicate. `done` defaults to `watched` so old cases read the same. */
const gp = ({
  watched = [],
  done = watched,
  outstanding = {},
}: {
  watched?: string[];
  done?: string[];
  outstanding?: Record<string, OutstandingItem[]>;
} = {}): GateProgress => ({
  watched: new Set(watched),
  done: new Set(done),
  outstanding: new Map(Object.entries(outstanding)),
});

describe('gating on done', () => {
  const chain = (a: Partial<GateLesson> = {}) =>
    course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        sequentialLessons: true,
        lessons: [
          lesson({ slug: 'a', name: 'A', ...a }),
          lesson({ slug: 'b', name: 'B' }),
        ],
      },
    ]);

  it('next lesson locks until previous is done, even when its video is watched', () => {
    const outstanding: OutstandingItem[] = [
      { kind: 'quiz' },
      { kind: 'section', section: 'keyPoints' },
    ];
    expect(
      evaluateLessonLock(
        chain(),
        'b',
        gp({ watched: ['a'], done: [], outstanding: { a: outstanding } }),
      ),
    ).toEqual({
      kind: 'lesson-locked',
      lessonSlug: 'a',
      moduleSlug: 'm1',
      lessonName: 'A',
      outstanding,
    });
  });

  it('opens when previous is done', () => {
    expect(evaluateLessonLock(chain(), 'b', gp({ done: ['a'] }))).toEqual({
      kind: 'open',
    });
  });

  it('gate reads done set, not percent', () => {
    // Done is sticky: a lesson that later grew a new tab still counts.
    expect(
      evaluateLessonLock(
        chain(),
        'b',
        gp({ done: ['a'], outstanding: { a: [{ kind: 'quiz' }] } }),
      ),
    ).toEqual({ kind: 'open' });
  });

  it('video-less lesson now blocks the chain', () => {
    expect(
      evaluateLessonLock(
        chain({ hasVideo: false }),
        'b',
        gp({ outstanding: { a: [{ kind: 'visit' }] } }),
      ),
    ).toEqual({
      kind: 'lesson-locked',
      lessonSlug: 'a',
      moduleSlug: 'm1',
      lessonName: 'A',
      outstanding: [{ kind: 'visit' }],
    });
  });

  it('a lesson that needs no video watch still blocks the chain until done', () => {
    expect(
      evaluateLessonLock(chain({ needsVideoWatch: false }), 'b', gp()).kind,
    ).toBe('lesson-locked');
  });

  it('unavailable lesson never blocks', () => {
    expect(
      evaluateLessonLock(chain({ isAvailable: false }), 'b', gp()),
    ).toEqual({ kind: 'open' });
  });

  it('reports no outstanding items when none were supplied', () => {
    const lock = evaluateLessonLock(chain(), 'b', gp());
    expect(lock).toMatchObject({ kind: 'lesson-locked', outstanding: [] });
  });

  it('module lock names count and first unfinished lesson', () => {
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        sequentialLessons: false,
        lessons: [
          lesson({ slug: 'x', name: 'X' }),
          lesson({ slug: 'wip', name: 'WIP', isAvailable: false }),
          lesson({ slug: 'y', name: 'Y' }),
          lesson({ slug: 'z', name: 'Z' }),
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
    expect(
      evaluateLessonLock(
        c,
        'b',
        gp({
          watched: ['x', 'y', 'z'],
          done: ['x'],
          outstanding: { y: [{ kind: 'quiz' }], z: [{ kind: 'visit' }] },
        }),
      ),
    ).toEqual({
      kind: 'module-locked',
      moduleSlug: 'm1',
      moduleName: 'Module One',
      lessonsLeft: 2,
      next: { lessonName: 'Y', outstanding: [{ kind: 'quiz' }] },
    });
  });

  it('material lock still uses watched', () => {
    expect(evaluateMaterialLock(chain(), 'a', gp({ done: ['a'] }))).toEqual({
      kind: 'video-locked',
    });
    expect(
      evaluateMaterialLock(chain(), 'a', gp({ watched: ['a'], done: [] })),
    ).toEqual({ kind: 'open' });
  });
});

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
    expect(evaluateLessonLock(twoModules, 'b', gp())).toEqual({
      kind: 'module-locked',
      moduleSlug: 'm1',
      moduleName: 'Module One',
      lessonsLeft: 1,
      next: { lessonName: 'A', outstanding: [] },
    });
  });

  it('opens once every available lesson of the prerequisite module is satisfied', () => {
    expect(evaluateLessonLock(twoModules, 'b', gp({ watched: ['a'] }))).toEqual(
      {
        kind: 'open',
      },
    );
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
    expect(evaluateLessonLock(c, 'b', gp())).toEqual({
      kind: 'lesson-locked',
      lessonSlug: 'a',
      moduleSlug: 'm1',
      lessonName: 'A',
      outstanding: [],
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
    expect(evaluateLessonLock(c, 'b', gp())).toEqual({ kind: 'open' });
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
    expect(evaluateLessonLock(c, 'b', gp())).toEqual({ kind: 'open' });
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
    expect(evaluateLessonLock(c, 'b', gp({ watched: ['a'] }))).toEqual({
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
    expect(evaluateLessonLock(c, 'b', gp({ watched: ['a'] }))).toEqual({
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
    expect(evaluateMaterialLock(c, 'a', gp())).toEqual({
      kind: 'video-locked',
    });
    expect(evaluateMaterialLock(c, 'a', gp({ watched: ['a'] }))).toEqual({
      kind: 'open',
    });
  });
});

describe('lockedResponse', () => {
  it('reports the module gate as the reason', () => {
    expect(
      lockedResponse(
        {
          kind: 'module-locked',
          moduleSlug: 'm1',
          moduleName: 'M',
          lessonsLeft: 2,
          next: { lessonName: 'Y', outstanding: [{ kind: 'quiz' }] },
        },
        { kind: 'open' },
      ),
    ).toEqual({
      locked: true,
      reason: 'module',
      blockedBy: {
        moduleSlug: 'm1',
        moduleName: 'M',
        lessonsLeft: 2,
        next: { lessonName: 'Y', outstanding: [{ kind: 'quiz' }] },
      },
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
          outstanding: [{ kind: 'video' }],
        },
        { kind: 'open' },
      ),
    ).toEqual({
      locked: true,
      reason: 'lesson',
      blockedBy: {
        lessonSlug: 'a',
        moduleSlug: 'm1',
        lessonName: 'A',
        outstanding: [{ kind: 'video' }],
      },
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

describe('isMaterialReadOnly', () => {
  it('is true for an unlocked response explicitly flagged readOnly', () => {
    expect(
      isMaterialReadOnly({
        locked: false,
        adminBypass: false,
        readOnly: true,
        material: null,
      }),
    ).toBe(true);
  });

  it('is false for an unlocked response with readOnly absent', () => {
    expect(
      isMaterialReadOnly({ locked: false, adminBypass: false, material: null }),
    ).toBe(false);
  });

  it('is false for an unlocked response with readOnly explicitly false', () => {
    expect(
      isMaterialReadOnly({
        locked: false,
        adminBypass: false,
        readOnly: false,
        material: null,
      }),
    ).toBe(false);
  });

  it('is false for a locked response, whatever the (impossible) shape claims', () => {
    // readOnly does not exist on the locked variant of the type — cast to
    // prove the runtime check fails closed even against a malformed/stale
    // cache entry that somehow carries both.
    expect(
      isMaterialReadOnly({
        locked: true,
        reason: 'video',
        readOnly: true,
      } as unknown as Parameters<typeof isMaterialReadOnly>[0]),
    ).toBe(false);
  });

  it('is false for undefined (query not yet settled)', () => {
    expect(isMaterialReadOnly(undefined)).toBe(false);
  });
});
