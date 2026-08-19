import { describe, expect, it } from 'vitest';
import {
  evaluateLessonLock,
  explainLessonPrerequisites,
  type GateCourse,
  type GateLesson,
  type GateLessonDependency,
} from '#/lib/lesson-gating';

/** A lesson that CAN block: available, has a video, and must be watched. */
const blocking = (
  slug: string,
  dependsOn: GateLessonDependency[] = [],
): GateLesson => ({
  slug,
  name: slug,
  isAvailable: true,
  hasVideo: true,
  needsVideoWatch: true,
  levels: [],
  dependsOn,
});

/** Reading-only: no video, so `isLessonSatisfied` is unconditionally true. */
const reading = (
  slug: string,
  dependsOn: GateLessonDependency[] = [],
): GateLesson => ({ ...blocking(slug, dependsOn), hasVideo: false });

const course = (
  ...modules: {
    slug: string;
    sequential?: boolean;
    lessons: GateLesson[];
  }[]
): GateCourse => ({
  modules: modules.map((m) => ({
    slug: m.slug,
    name: m.slug,
    dependsOn: [],
    sequentialLessons: m.sequential ?? true,
    lessons: m.lessons,
  })),
});

const prereqs = (c: GateCourse, slug: string) =>
  explainLessonPrerequisites(c, slug).prerequisites.map((p) => p.slug);

describe('the derived chain', () => {
  it('gates each lesson on the one before it', () => {
    const c = course({ slug: 'm', lessons: [blocking('a'), blocking('b')] });
    expect(prereqs(c, 'a')).toEqual([]);
    expect(prereqs(c, 'b')).toEqual(['a']);
  });

  it('is off when the module says any order', () => {
    const c = course({
      slug: 'm',
      sequential: false,
      lessons: [blocking('a'), blocking('b')],
    });
    expect(prereqs(c, 'b')).toEqual([]);
  });

  it('does not cross module boundaries', () => {
    // Sequencing across modules is what module prerequisites already are;
    // chaining here too would gate the same thing twice.
    const c = course(
      { slug: 'm1', lessons: [blocking('a')] },
      { slug: 'm2', lessons: [blocking('b')] },
    );
    expect(prereqs(c, 'b')).toEqual([]);
  });

  it('skips a lesson that cannot block, and reports what it skipped', () => {
    // THE bug this rule exists for. `isLessonSatisfied` returns true for a
    // video-less lesson whether or not that lesson is itself locked, so
    // chaining `c` to `b` would open `c` to a learner who has watched nothing.
    const c = course({
      slug: 'm',
      lessons: [blocking('a'), reading('b'), blocking('c')],
    });
    expect(prereqs(c, 'c')).toEqual(['a']);
    const explanation = explainLessonPrerequisites(c, 'c');
    expect(explanation.skipped.map((l) => l.slug)).toEqual(['b']);
  });

  it('leaves a lesson open when nothing before it can block', () => {
    const c = course({
      slug: 'm',
      lessons: [reading('a'), reading('b'), blocking('c')],
    });
    expect(prereqs(c, 'c')).toEqual([]);
  });

  it('actually locks the dependent lesson', () => {
    // The chain must reach the gate, not just the explanation — asserting on
    // `explainLessonPrerequisites` alone would pass with the expansion wired
    // to nothing.
    const c = course({ slug: 'm', lessons: [blocking('a'), blocking('b')] });
    expect(evaluateLessonLock(c, 'b', new Set()).kind).toBe('lesson-locked');
    expect(evaluateLessonLock(c, 'b', new Set(['a'])).kind).toBe('open');
  });

  it('does not leak past a video-less lesson', () => {
    const c = course({
      slug: 'm',
      lessons: [blocking('a'), reading('b'), blocking('c')],
    });
    // Watched nothing: `c` must still be locked, by `a`.
    expect(evaluateLessonLock(c, 'c', new Set()).kind).toBe('lesson-locked');
    expect(evaluateLessonLock(c, 'c', new Set(['a'])).kind).toBe('open');
  });
});

describe('explicit overrides', () => {
  it('replace the chain rather than adding to it', () => {
    const c = course({
      slug: 'm',
      lessons: [
        blocking('a'),
        blocking('b'),
        blocking('c', [{ lessonSlug: 'a' }]),
      ],
    });
    // Not ['a', 'b'] — an override is how a lesson gets OFF the chain.
    expect(prereqs(c, 'c')).toEqual(['a']);
    expect(explainLessonPrerequisites(c, 'c').source).toBe('explicit');
  });

  it('resolve across modules by slug alone', () => {
    // moduleSlug is not consulted: lesson slugs are globally unique, and
    // resolving through the module made a gate vanish the moment either
    // lesson was moved.
    const c = course(
      { slug: 'm1', lessons: [blocking('a')] },
      { slug: 'm2', lessons: [blocking('b', [{ lessonSlug: 'a' }])] },
    );
    expect(prereqs(c, 'b')).toEqual(['a']);
  });

  it('resolve even when the stored moduleSlug is stale', () => {
    const c = course(
      { slug: 'm1', lessons: [blocking('a')] },
      {
        slug: 'm2',
        lessons: [
          blocking('b', [{ lessonSlug: 'a', moduleSlug: 'gone-away' }]),
        ],
      },
    );
    expect(prereqs(c, 'b')).toEqual(['a']);
  });

  it('keep a lesson off the chain even when every edge is ignored', () => {
    // Falling back would silently reimpose the sequencing the admin replaced.
    const c = course({
      slug: 'm',
      lessons: [
        blocking('a'),
        blocking('b', [{ lessonSlug: 'c' }]),
        blocking('c'),
      ],
    });
    expect(prereqs(c, 'b')).toEqual([]);
    expect(explainLessonPrerequisites(c, 'b').source).toBe('explicit');
  });
});

describe('forward edges', () => {
  it('are dropped, and reported as ignored', () => {
    const c = course({
      slug: 'm',
      lessons: [blocking('a', [{ lessonSlug: 'b' }]), blocking('b')],
    });
    expect(prereqs(c, 'a')).toEqual([]);
    expect(
      explainLessonPrerequisites(c, 'a').ignoredForward.map((l) => l.slug),
    ).toEqual(['b']);
  });

  it('make a lesson cycle impossible to express', () => {
    // The reorder hazard: an override written when `b` came first survives a
    // drag that moves it after `a`. With both edges honoured this deadlocks
    // both lessons permanently; only one of them can point backwards.
    const c = course({
      slug: 'm',
      lessons: [
        blocking('a', [{ lessonSlug: 'b' }]),
        blocking('b', [{ lessonSlug: 'a' }]),
      ],
    });
    expect(evaluateLessonLock(c, 'a', new Set()).kind).toBe('open');
    expect(evaluateLessonLock(c, 'b', new Set()).kind).toBe('lesson-locked');
    expect(evaluateLessonLock(c, 'b', new Set(['a'])).kind).toBe('open');
  });

  it('are dropped across modules too', () => {
    const c = course(
      { slug: 'm1', lessons: [blocking('a', [{ lessonSlug: 'b' }])] },
      { slug: 'm2', lessons: [blocking('b')] },
    );
    expect(prereqs(c, 'a')).toEqual([]);
  });

  it('keep only the backward half of a mixed override', () => {
    const c = course({
      slug: 'm',
      lessons: [
        blocking('a'),
        blocking('b', [{ lessonSlug: 'a' }, { lessonSlug: 'c' }]),
        blocking('c'),
      ],
    });
    expect(prereqs(c, 'b')).toEqual(['a']);
  });
});

describe('unresolvable edges', () => {
  it('are skipped, as a deleted prerequisite leaves behind', () => {
    const c = course({
      slug: 'm',
      lessons: [blocking('a'), blocking('b', [{ lessonSlug: 'deleted' }])],
    });
    expect(prereqs(c, 'b')).toEqual([]);
    expect(evaluateLessonLock(c, 'b', new Set()).kind).toBe('open');
  });
});
