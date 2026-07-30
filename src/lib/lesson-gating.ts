/**
 * Pure lesson-gating predicate. The single source of truth for three gates:
 * module prerequisites, lesson prerequisites, and the lesson's own video.
 *
 * The server imports this to ENFORCE; the client imports it to EXPLAIN. They
 * must never disagree, so this file has no DB, network, or React dependency.
 * See docs/superpowers/specs/2026-07-30-lesson-gating-ledger.md.
 *
 * Admin bypass is deliberately NOT modelled here — callers skip the predicate
 * entirely for admins, so this stays a pure statement about student progress.
 */

export type GateLessonDependency = {
  lessonSlug: string;
  /** Absent when the prerequisite sits in the same module as its dependent. */
  moduleSlug?: string;
};

export type GateLesson = {
  slug: string;
  name: string;
  isAvailable: boolean;
  videoId: string | null;
  needsVideoWatch: boolean;
  dependsOn: readonly GateLessonDependency[];
};

export type GateModule = {
  slug: string;
  name: string;
  /** Slugs of modules that must be finished before this one opens. */
  dependsOn: readonly string[];
  lessons: readonly GateLesson[];
};

export type GateCourse = { modules: readonly GateModule[] };

export type LessonLock =
  | { kind: 'open' }
  | { kind: 'module-locked'; moduleSlug: string; moduleName: string }
  | {
      kind: 'lesson-locked';
      lessonSlug: string;
      moduleSlug: string;
      lessonName: string;
    };

export type MaterialLock = { kind: 'open' } | { kind: 'video-locked' };

export type LockedMaterialResponse =
  | { locked: true; reason: 'video' }
  | {
      locked: true;
      reason: 'lesson';
      blockedBy: { lessonSlug: string; moduleSlug: string; lessonName: string };
    }
  | {
      locked: true;
      reason: 'module';
      blockedBy: { moduleSlug: string; moduleName: string };
    };

/**
 * Content is nested under `material` rather than spread flat, so a locked
 * response CANNOT carry it. With a flat shape, every column added to
 * lesson_material would leak until someone remembered to null it too.
 */
export type LessonMaterialResponse<TMaterial> =
  | { locked: false; adminBypass: boolean; material: TMaterial }
  | LockedMaterialResponse;

const OPEN_LESSON: LessonLock = { kind: 'open' };
const OPEN_MATERIAL: MaterialLock = { kind: 'open' };

/**
 * Whether a lesson's own video requirement is met.
 *
 * Three escapes, all deliberate: an unavailable (WIP) lesson is outside gate
 * logic entirely; a lesson with watching switched off cannot block; and a
 * lesson with no video has nothing to watch — needsVideoWatch defaults to
 * true, so blocking there would strand every video-less lesson forever.
 */
export function isLessonSatisfied(
  lesson: GateLesson,
  watchedLessonSlugs: ReadonlySet<string>,
): boolean {
  if (!lesson.isAvailable) return true;
  if (!lesson.needsVideoWatch) return true;
  if (!lesson.videoId) return true;
  return watchedLessonSlugs.has(lesson.slug);
}

function locate(
  course: GateCourse,
  lessonSlug: string,
): { module: GateModule; lesson: GateLesson } | null {
  for (const module of course.modules) {
    const lesson = module.lessons.find((l) => l.slug === lessonSlug);
    if (lesson) return { module, lesson };
  }
  return null;
}

/**
 * Whether the whole lesson — video AND material — is reachable. Module
 * prerequisites are checked before lesson prerequisites, so the coarsest
 * unmet requirement is the one reported.
 *
 * A prerequisite no student action can satisfy never blocks: a module or
 * lesson that does not exist, or one that is unavailable, is skipped. The
 * dependency graph is edited independently of availability and video
 * assignment, so unsatisfiable edges appear routinely; failing closed on them
 * silently kills whole chains of content.
 *
 * Only direct edges are walked. Transitivity emerges because a locked lesson
 * is unplayable, so its video cannot be watched, so its dependents stay locked.
 */
export function evaluateLessonLock(
  course: GateCourse,
  lessonSlug: string,
  watchedLessonSlugs: ReadonlySet<string>,
): LessonLock {
  const found = locate(course, lessonSlug);
  // An unknown lesson is not this function's error to report — callers 404.
  if (!found) return OPEN_LESSON;
  const { module, lesson } = found;

  for (const prereqSlug of module.dependsOn) {
    const prereq = course.modules.find((m) => m.slug === prereqSlug);
    if (!prereq) continue;
    const satisfied = prereq.lessons
      .filter((l) => l.isAvailable)
      .every((l) => isLessonSatisfied(l, watchedLessonSlugs));
    if (!satisfied) {
      return {
        kind: 'module-locked',
        moduleSlug: prereq.slug,
        moduleName: prereq.name,
      };
    }
  }

  for (const dep of lesson.dependsOn) {
    const depModule = course.modules.find(
      (m) => m.slug === (dep.moduleSlug ?? module.slug),
    );
    if (!depModule) continue;
    const depLesson = depModule.lessons.find((l) => l.slug === dep.lessonSlug);
    if (!depLesson || !depLesson.isAvailable) continue;
    if (!isLessonSatisfied(depLesson, watchedLessonSlugs)) {
      return {
        kind: 'lesson-locked',
        lessonSlug: depLesson.slug,
        moduleSlug: depModule.slug,
        lessonName: depLesson.name,
      };
    }
  }

  return OPEN_LESSON;
}

/**
 * Whether the lesson's material is readable, assuming evaluateLessonLock is
 * already open. The lesson's own video controls this gate and no other.
 */
export function evaluateMaterialLock(
  course: GateCourse,
  lessonSlug: string,
  watchedLessonSlugs: ReadonlySet<string>,
): MaterialLock {
  const found = locate(course, lessonSlug);
  if (!found) return OPEN_MATERIAL;
  return isLessonSatisfied(found.lesson, watchedLessonSlugs)
    ? OPEN_MATERIAL
    : { kind: 'video-locked' };
}

/**
 * The locked response body for a pair of lock states, or null when nothing is
 * locked. Route handlers call this instead of assembling the shape by hand.
 */
export function lockedResponse(
  lessonLock: LessonLock,
  materialLock: MaterialLock,
): LockedMaterialResponse | null {
  if (lessonLock.kind === 'module-locked') {
    return {
      locked: true,
      reason: 'module',
      blockedBy: {
        moduleSlug: lessonLock.moduleSlug,
        moduleName: lessonLock.moduleName,
      },
    };
  }
  if (lessonLock.kind === 'lesson-locked') {
    return {
      locked: true,
      reason: 'lesson',
      blockedBy: {
        lessonSlug: lessonLock.lessonSlug,
        moduleSlug: lessonLock.moduleSlug,
        lessonName: lessonLock.lessonName,
      },
    };
  }
  if (materialLock.kind === 'video-locked') {
    return { locked: true, reason: 'video' };
  }
  return null;
}
