import {
  evaluateLessonLock,
  type GateCourse,
  type GateLesson,
  type LessonLock,
} from '#/lib/lesson-gating';

/**
 * Where `/course/$courseSlug` should send a learner.
 *
 * `none` is not an error — it is the honest answer for a course with nothing
 * published, or nothing this learner can open yet. It carries the reason so
 * the empty state can say which, because the two have opposite remedies:
 * wait for an admin, versus go and finish a prerequisite. See
 * docs/superpowers/specs/2026-07-30-course-resume-redirect-ledger.md (D8).
 */
export type ResumeTarget =
  | { kind: 'lesson'; moduleSlug: string; lessonSlug: string }
  | { kind: 'none'; reason: 'no-lessons' }
  | { kind: 'none'; reason: 'all-locked'; lock: LessonLock };

export type ResolveResumeArgs = {
  course: GateCourse;
  /** Lesson slugs whose video this learner has watched — see watchedLessonSlugs. */
  watched: ReadonlySet<string>;
  /**
   * Slug of the learner's last-viewed lesson, or null when they have never
   * opened one here. A slug that no longer exists in the course is treated
   * exactly like null: the lesson was deleted, and falling back is the whole
   * point of storing the FK as `on delete set null`.
   */
  pointerLessonSlug: string | null;
  /**
   * Treat every lesson as unlocked. True for admins, who bypass all three
   * gates on the server (`evaluateLessonGate`) and in the sidebar
   * (`computeLessonLocks`). Without it an admin who opened a lesson under
   * bypass would be hopped off it on their next visit, to a "blocker" that
   * does not block them — the resume path disagreeing with every other gate
   * in the app about what an admin can see.
   */
  bypassLocks?: boolean;
};

type Located = { moduleSlug: string; lesson: GateLesson };

const OPEN: LessonLock = { kind: 'open' };

/**
 * Every lesson a learner could in principle be sent to, in
 * (module rank, lesson rank) order — which is the order the course payload
 * already arrives in, since `shapeModuleLessons` sorts it.
 *
 * Unavailable lessons are dropped here rather than trusted to be absent.
 * `getCourseDetails` does strip them today, but this predicate is also the
 * one deciding a brand-new learner's very first screen, and a WIP lesson
 * leaking into that position is a bad enough first impression to be worth
 * two lines of defence.
 */
function candidates(course: GateCourse): Located[] {
  const out: Located[] = [];
  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      if (lesson.isAvailable) out.push({ moduleSlug: module.slug, lesson });
    }
  }
  return out;
}

const toTarget = (found: Located): ResumeTarget => ({
  kind: 'lesson',
  moduleSlug: found.moduleSlug,
  lessonSlug: found.lesson.slug,
});

/**
 * Resolve where to send a learner opening a course.
 *
 * Order of preference: their last-viewed lesson; the lesson blocking it if
 * that has since locked; otherwise the first lesson they can open.
 *
 * The blocker hop is deliberately ONE hop, not a walk to the root of the
 * dependency chain. A single hop needs no visited set, so a cyclic
 * dependency graph — which an admin can create, and which the `all-locked`
 * test covers — cannot hang this function. When one hop is not enough the
 * fallback catches it, at the cost of landing further back than strictly
 * necessary in a rare case.
 */
export function resolveResumeTarget({
  course,
  watched,
  pointerLessonSlug,
  bypassLocks = false,
}: ResolveResumeArgs): ResumeTarget {
  const all = candidates(course);
  if (all.length === 0) return { kind: 'none', reason: 'no-lessons' };

  const lockOf = (slug: string): LessonLock =>
    bypassLocks ? OPEN : evaluateLessonLock(course, slug, watched);
  const firstOpen = () =>
    all.find((c) => lockOf(c.lesson.slug).kind === 'open');

  const pointer =
    pointerLessonSlug == null
      ? undefined
      : all.find((c) => c.lesson.slug === pointerLessonSlug);

  if (pointer) {
    const lock = lockOf(pointer.lesson.slug);
    if (lock.kind === 'open') return toTarget(pointer);

    // One hop to whatever is blocking them. This is the most useful place on
    // the site at that moment: it is precisely what they must finish to get
    // back where they were. Falling straight through to firstOpen() would
    // deposit a learner forty lessons deep back at lesson one, which reads
    // as the app having lost their progress.
    const hop =
      lock.kind === 'lesson-locked'
        ? all.find((c) => c.lesson.slug === lock.lessonSlug)
        : // module-locked names a module, not a lesson — aim at the first
          // lesson of it that they can actually open.
          all.find(
            (c) =>
              c.moduleSlug === lock.moduleSlug &&
              lockOf(c.lesson.slug).kind === 'open',
          );

    if (hop && lockOf(hop.lesson.slug).kind === 'open') return toTarget(hop);
  }

  const open = firstOpen();
  if (open) return toTarget(open);

  // Lessons exist but every one is locked. Report the first lesson's lock:
  // it is the shallowest blocker in course order, so it is the one the
  // learner is most likely able to act on.
  return {
    kind: 'none',
    reason: 'all-locked',
    lock: lockOf(all[0].lesson.slug),
  };
}
