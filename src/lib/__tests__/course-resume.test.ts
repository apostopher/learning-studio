import { describe, expect, it } from 'vitest';
import { resolveResumeTarget } from '#/lib/course-resume';
import type { GateCourse } from '#/lib/lesson-gating';

/**
 * A lesson that blocks its dependents until watched: available, has a video,
 * and needsVideoWatch. `isLessonSatisfied` short-circuits on any of those
 * being absent, so a prerequisite built without all three can never lock
 * anything and every lock test built on it would vacuously pass.
 */
const lesson = (
  slug: string,
  dependsOn: GateCourse['modules'][number]['lessons'][number]['dependsOn'] = [],
) => ({
  slug,
  name: slug,
  isAvailable: true,
  hasVideo: true,
  needsVideoWatch: true,
  levels: [],
  dependsOn,
});

const course = (
  ...modules: {
    slug: string;
    dependsOn?: string[];
    sequentialLessons?: boolean;
    lessons: ReturnType<typeof lesson>[];
  }[]
): GateCourse => ({
  modules: modules.map((m) => ({
    slug: m.slug,
    name: m.slug,
    dependsOn: m.dependsOn ?? [],
    // These fixtures predate the derived chain and state their edges
    // explicitly, so default it off: switching it on here would add
    // prerequisites the assertions never described.
    sequentialLessons: m.sequentialLessons ?? false,
    lessons: m.lessons,
  })),
});

const linear = course(
  { slug: 'm1', lessons: [lesson('l1'), lesson('l2', [{ lessonSlug: 'l1' }])] },
  {
    slug: 'm2',
    dependsOn: ['m1'],
    lessons: [lesson('l3'), lesson('l4', [{ lessonSlug: 'l3' }])],
  },
);

describe('resolveResumeTarget', () => {
  describe('with no pointer', () => {
    it('targets the first unlocked lesson in module/lesson order', () => {
      expect(
        resolveResumeTarget({
          course: linear,
          watched: new Set(),
          pointerLessonSlug: null,
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm1', lessonSlug: 'l1' });
    });

    it('skips a leading lesson that is unavailable', () => {
      const c = course({
        slug: 'm1',
        lessons: [{ ...lesson('draft'), isAvailable: false }, lesson('real')],
      });
      expect(
        resolveResumeTarget({
          course: c,
          watched: new Set(),
          pointerLessonSlug: null,
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm1', lessonSlug: 'real' });
    });

    it('skips a leading lesson that is locked', () => {
      // m1 requires m2, so lesson order and unlocked order disagree —
      // first-by-rank would land on a lock screen.
      //
      // Expressed with a MODULE prerequisite rather than a lesson one: a
      // lesson can only ever be gated by an earlier lesson now (forward edges
      // are dropped at expansion), so a leading LESSON cannot be lesson-locked
      // by a later one. Module edges carry no such restriction.
      const c = course(
        { slug: 'm1', dependsOn: ['m2'], lessons: [lesson('gated')] },
        { slug: 'm2', lessons: [lesson('open')] },
      );
      expect(
        resolveResumeTarget({
          course: c,
          watched: new Set(),
          pointerLessonSlug: null,
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm2', lessonSlug: 'open' });
    });
  });

  describe('with a pointer', () => {
    it('targets the pointed-at lesson when it is unlocked', () => {
      expect(
        resolveResumeTarget({
          course: linear,
          watched: new Set(['l1']),
          pointerLessonSlug: 'l2',
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm1', lessonSlug: 'l2' });
    });

    it('falls back when the pointer names a lesson that no longer exists', () => {
      expect(
        resolveResumeTarget({
          course: linear,
          watched: new Set(),
          pointerLessonSlug: 'deleted',
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm1', lessonSlug: 'l1' });
    });

    it('hops to the blocking lesson when the pointer became lesson-locked', () => {
      // l2 needs l1 watched. Nothing is watched, so l2 is locked by l1 —
      // and l1, not lesson one of the course, is where they need to be.
      expect(
        resolveResumeTarget({
          course: linear,
          watched: new Set(),
          pointerLessonSlug: 'l2',
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm1', lessonSlug: 'l1' });
    });

    it("hops to the blocking module's first unlocked lesson when module-locked", () => {
      // l3 sits in m2, which depends on all of m1. m1 is unwatched, so the
      // hop lands on m1's first lesson rather than crawling back to the top.
      const c = course(
        { slug: 'm1', lessons: [lesson('a'), lesson('b')] },
        { slug: 'm2', dependsOn: ['m1'], lessons: [lesson('c')] },
      );
      expect(
        resolveResumeTarget({
          course: c,
          watched: new Set(),
          pointerLessonSlug: 'c',
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm1', lessonSlug: 'a' });
    });

    it('does not crawl back to lesson one when a mid-course blocker is open', () => {
      // The regression this whole hop exists to prevent: a learner deep in
      // m2 must not be deposited at the very first lesson of the course.
      const target = resolveResumeTarget({
        course: linear,
        watched: new Set(['l1', 'l2']),
        pointerLessonSlug: 'l4',
      });
      expect(target).toEqual({
        kind: 'lesson',
        moduleSlug: 'm2',
        lessonSlug: 'l3',
      });
    });

    it('falls back to the first unlocked lesson when the blocker is also locked', () => {
      // c is locked by b, and b is itself locked by a. One hop is not enough,
      // so this must land on a rather than on the still-locked b.
      const c = course({
        slug: 'm1',
        lessons: [
          lesson('a'),
          lesson('b', [{ lessonSlug: 'a' }]),
          lesson('c', [{ lessonSlug: 'b' }]),
        ],
      });
      expect(
        resolveResumeTarget({
          course: c,
          watched: new Set(),
          pointerLessonSlug: 'c',
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm1', lessonSlug: 'a' });
    });
  });

  describe('with bypassLocks (admins)', () => {
    it('honours a pointer at a lesson that would be locked for a student', () => {
      // Nothing watched, so l2 is lesson-locked by l1 — a student gets hopped
      // back to l1 (asserted above). An admin must stay where they were.
      expect(
        resolveResumeTarget({
          course: linear,
          watched: new Set(),
          pointerLessonSlug: 'l2',
          bypassLocks: true,
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm1', lessonSlug: 'l2' });
    });

    it('never reports all-locked, since nothing is locked', () => {
      const c = course(
        {
          slug: 'm1',
          lessons: [lesson('x', [{ lessonSlug: 'y', moduleSlug: 'm2' }])],
        },
        {
          slug: 'm2',
          lessons: [lesson('y', [{ lessonSlug: 'x', moduleSlug: 'm1' }])],
        },
      );
      expect(
        resolveResumeTarget({
          course: c,
          watched: new Set(),
          pointerLessonSlug: null,
          bypassLocks: true,
        }),
      ).toEqual({ kind: 'lesson', moduleSlug: 'm1', lessonSlug: 'x' });
    });

    it('still reports no-lessons for an empty course', () => {
      expect(
        resolveResumeTarget({
          course: { modules: [] },
          watched: new Set(),
          pointerLessonSlug: null,
          bypassLocks: true,
        }),
      ).toEqual({ kind: 'none', reason: 'no-lessons' });
    });
  });

  describe('when there is nothing to target', () => {
    it('reports no-lessons for a course with no modules', () => {
      expect(
        resolveResumeTarget({
          course: { modules: [] },
          watched: new Set(),
          pointerLessonSlug: null,
        }),
      ).toEqual({ kind: 'none', reason: 'no-lessons' });
    });

    it('reports no-lessons when every lesson is unavailable', () => {
      const c = course({
        slug: 'm1',
        lessons: [{ ...lesson('draft'), isAvailable: false }],
      });
      expect(
        resolveResumeTarget({
          course: c,
          watched: new Set(),
          pointerLessonSlug: null,
        }),
      ).toEqual({ kind: 'none', reason: 'no-lessons' });
    });

    it('reports all-locked, carrying the blocker, when lessons exist but none open', () => {
      // A MODULE cycle: m1 requires m2 and m2 requires m1, so nothing is
      // reachable. `updateModuleDependencies` rejects new cycles, but
      // `cyclicPrerequisites` documents that rows predating that validation
      // can already be cyclic, so this state is still reachable in data.
      //
      // Deliberately not a LESSON cycle: those are now impossible by
      // construction, since every surviving lesson edge points backwards.
      const c = course(
        { slug: 'm1', dependsOn: ['m2'], lessons: [lesson('x')] },
        { slug: 'm2', dependsOn: ['m1'], lessons: [lesson('y')] },
      );
      expect(
        resolveResumeTarget({
          course: c,
          watched: new Set(),
          pointerLessonSlug: null,
        }),
      ).toEqual({
        kind: 'none',
        reason: 'all-locked',
        lock: { kind: 'module-locked', moduleSlug: 'm2', moduleName: 'm2' },
      });
    });
  });
});
