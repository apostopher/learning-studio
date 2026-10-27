/**
 * Pure lesson-gating predicate. The single source of truth for three gates:
 * module prerequisites, lesson prerequisites, and the lesson's own video.
 *
 * The server imports this to ENFORCE; the client imports it to EXPLAIN. They
 * must never disagree, so this file has no DB, network, or React dependency.
 * See docs/superpowers/specs/2026-07-30-lesson-gating-ledger.md.
 *
 * Two different progress facts feed it, and they are not interchangeable:
 * the lesson's OWN material unlocks on its video being watched, while every
 * prerequisite — lesson or module — is met only when that lesson is DONE
 * (100% of video, tabs and quiz; sticky, from `lesson_completions`).
 *
 * Admin bypass is deliberately NOT modelled here — callers skip the predicate
 * entirely for admins, so this stays a pure statement about student progress.
 */

import type { OutstandingItem } from '#/lib/course-progress-agg';

/**
 * A learner's progress as the gate reads it, keyed by lesson slug.
 *
 * Built by `gateProgress` from the course payload and the progress summary.
 */
export type GateProgress = {
  /** Video fully watched — drives ONLY the lesson's own material lock. */
  watched: ReadonlySet<string>;
  /** Sticky done — drives lesson and module prerequisites. */
  done: ReadonlySet<string>;
  /**
   * What each lesson still needs, so a lock can say what to do next.
   * Per lesson slug; may be empty where copy is not needed (card resume).
   * A missing entry reads as nothing outstanding.
   */
  outstanding: ReadonlyMap<string, readonly OutstandingItem[]>;
};

export type GateLessonDependency = {
  lessonSlug: string;
  /** Absent when the prerequisite sits in the same module as its dependent. */
  moduleSlug?: string;
};

export type GateLesson = {
  slug: string;
  name: string;
  isAvailable: boolean;
  hasVideo: boolean;
  needsVideoWatch: boolean;
  /**
   * Tiers that see this lesson; empty means all.
   *
   * Carried on the gate type so that a level-filtered GateCourse and an
   * unfiltered one are the same shape — the filter is applied by the caller,
   * not by the predicate.
   */
  levels: readonly string[];
  dependsOn: readonly GateLessonDependency[];
};

export type GateModule = {
  slug: string;
  name: string;
  /** Slugs of modules that must be finished before this one opens. */
  dependsOn: readonly string[];
  /**
   * Whether this module's lessons must be taken in order.
   *
   * Derived rather than stored as per-lesson edges: `moveLesson` both reorders
   * lessons and moves them between modules, so stored edges encode the order
   * at the moment they were written and quietly keep enforcing it after a
   * drag. A chain read off `rank` is correct by construction after every move.
   */
  sequentialLessons: boolean;
  /** In rank order — the chain and the ordering rules below depend on it. */
  lessons: readonly GateLesson[];
};

export type GateCourse = { modules: readonly GateModule[] };

export type LessonLock =
  | { kind: 'open' }
  | {
      kind: 'module-locked';
      moduleSlug: string;
      moduleName: string;
      /** Available lessons in the prerequisite module not yet done. */
      lessonsLeft: number;
      /** The first of those, in rank order, and what it still needs. */
      next: { lessonName: string; outstanding: readonly OutstandingItem[] };
    }
  | {
      kind: 'lesson-locked';
      lessonSlug: string;
      moduleSlug: string;
      lessonName: string;
      /** What the blocking lesson still needs before it is done. */
      outstanding: readonly OutstandingItem[];
    };

export type MaterialLock = { kind: 'open' } | { kind: 'video-locked' };

export type LockedMaterialResponse =
  | { locked: true; reason: 'video' }
  | {
      locked: true;
      reason: 'lesson';
      blockedBy: {
        lessonSlug: string;
        moduleSlug: string;
        lessonName: string;
        outstanding: readonly OutstandingItem[];
      };
    }
  | {
      locked: true;
      reason: 'module';
      blockedBy: {
        moduleSlug: string;
        moduleName: string;
        lessonsLeft: number;
        next: { lessonName: string; outstanding: readonly OutstandingItem[] };
      };
    };

/**
 * Content is nested under `material` rather than spread flat, so a locked
 * response CANNOT carry it. With a flat shape, every column added to
 * lesson_material would leak until someone remembered to null it too.
 */
/**
 * `material: null` is a first-class, non-error outcome: a lesson is allowed to
 * exist with no `lesson_material` row at all (video-only lessons are normal).
 * The route used to answer that with a 404, which the client surfaced as a
 * page-level error and — because this response is the page's lock signal —
 * suppressed the video too. Absent material is now "unlocked, nothing to read".
 */
export type LessonMaterialResponse<TMaterial> =
  | {
      locked: false;
      adminBypass: boolean;
      /**
       * Set only when the lesson sits outside the pilot's current level and
       * they completed it at an earlier one. The content is served, but
       * nothing they do with it is recorded — absent means the normal case.
       */
      readOnly?: boolean;
      material: TMaterial | null;
    }
  | LockedMaterialResponse;

/**
 * What is gating a lesson, and what was discarded on the way there.
 *
 * `ignoredForward` and `skipped` exist for the admin UI: both represent
 * prerequisites that look configured but do nothing, which is the failure
 * mode this system has no other detection path for.
 */
export type LessonPrerequisiteExplanation = {
  source: 'chain' | 'explicit' | 'none';
  /** In force right now. */
  prerequisites: readonly GateLesson[];
  /** Stored edges dropped because they point at a LATER lesson. */
  ignoredForward: readonly GateLesson[];
  /** Lessons the chain passed over because they cannot block. */
  skipped: readonly GateLesson[];
};

const NO_PREREQUISITES: LessonPrerequisiteExplanation = {
  source: 'none',
  prerequisites: [],
  ignoredForward: [],
  skipped: [],
};

const OPEN_LESSON: LessonLock = { kind: 'open' };
const OPEN_MATERIAL: MaterialLock = { kind: 'open' };

/**
 * Whether a lesson's own video requirement is met. Drives the lesson's own
 * material lock and library unlocks — NOT prerequisites, which need the
 * prerequisite lesson to be done (see `isPrerequisiteMet`).
 *
 * Three escapes, all deliberate: an unavailable (WIP) lesson is outside gate
 * logic entirely; a lesson with watching switched off does not lock its own
 * material; and a lesson with no video has nothing to watch. These escapes
 * only concern the lesson's own material — as a prerequisite, such a lesson
 * still blocks until it is done.
 */
export function isLessonSatisfied(
  lesson: GateLesson,
  watchedLessonSlugs: ReadonlySet<string>,
): boolean {
  if (!lesson.isAvailable) return true;
  if (!lesson.needsVideoWatch) return true;
  if (!lesson.hasVideo) return true;
  return watchedLessonSlugs.has(lesson.slug);
}

function locate(
  course: GateCourse,
  lessonSlug: string,
): { module: GateModule; lesson: GateLesson; index: number } | null {
  for (const module of course.modules) {
    const index = module.lessons.findIndex((l) => l.slug === lessonSlug);
    if (index !== -1) {
      return { module, lesson: module.lessons[index], index };
    }
  }
  return null;
}

/**
 * Whether this lesson is capable of blocking anything. Only an unavailable
 * (WIP) lesson cannot: no student action can make it done.
 *
 * Video-less and watch-optional lessons block like any other now, because a
 * prerequisite is met by the lesson being DONE, which every reachable lesson
 * can become (a visit and its tabs, at minimum).
 */
function canBlock(lesson: GateLesson): boolean {
  return lesson.isAvailable;
}

/** Whether a prerequisite lesson stops gating its dependents. */
function isPrerequisiteMet(
  lesson: GateLesson,
  progress: GateProgress,
): boolean {
  return !canBlock(lesson) || progress.done.has(lesson.slug);
}

const NOTHING_OUTSTANDING: readonly OutstandingItem[] = [];

function outstandingOf(
  progress: GateProgress,
  lessonSlug: string,
): readonly OutstandingItem[] {
  return progress.outstanding.get(lessonSlug) ?? NOTHING_OUTSTANDING;
}

/**
 * Course-wide position of every lesson, so "earlier" has one definition.
 *
 * Modules arrive in rank order and each module's lessons likewise (see
 * `shapeModuleLessons`), so array position IS rank order.
 */
function lessonPositions(course: GateCourse): Map<string, number> {
  const positions = new Map<string, number>();
  let position = 0;
  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      positions.set(lesson.slug, position);
      position += 1;
    }
  }
  return positions;
}

/**
 * Resolve a stored dependency to a lesson anywhere in the course.
 *
 * By `lessonSlug` alone: `lessons.slug` is globally UNIQUE, so the stored
 * `moduleSlug` is redundant — and resolving through it is actively harmful,
 * because moving EITHER lesson to another module makes the edge resolve to no
 * module and the gate disappear with nothing to indicate it. The field stays
 * in the persisted shape; it simply is not load-bearing.
 */
function resolveDependency(
  course: GateCourse,
  dep: GateLessonDependency,
): GateLesson | null {
  for (const module of course.modules) {
    const found = module.lessons.find((l) => l.slug === dep.lessonSlug);
    if (found) return found;
  }
  return null;
}

/**
 * The prerequisites actually in force for a lesson.
 *
 * Explicit edges REPLACE the chain rather than adding to it — additive cannot
 * express "this one is off the chain", which an alternative-path lesson needs.
 * A lesson with any stored edges is off the chain even when every one of them
 * is currently ignored, because falling back would silently reimpose the
 * sequencing the admin deliberately replaced.
 *
 * Edges pointing at a LATER lesson are dropped. That is what makes a cycle
 * structurally impossible rather than merely detected: every surviving edge
 * points strictly backwards, so no set of them can close a loop, whatever is
 * stored and however the lessons have since been dragged. Write-time
 * validation — which is all the module graph needs, since its edges are not
 * rank-derived — cannot catch this, because a reorder creates a cycle with
 * nobody editing a dependency at all.
 */
function effectivePrerequisites(
  course: GateCourse,
  module: GateModule,
  lesson: GateLesson,
  index: number,
): LessonPrerequisiteExplanation {
  if (lesson.dependsOn.length > 0) {
    const positions = lessonPositions(course);
    const self = positions.get(lesson.slug) ?? 0;
    const prerequisites: GateLesson[] = [];
    const ignoredForward: GateLesson[] = [];
    for (const dep of lesson.dependsOn) {
      const target = resolveDependency(course, dep);
      if (!target) continue;
      const targetPosition = positions.get(target.slug);
      if (targetPosition === undefined) continue;
      if (targetPosition >= self) ignoredForward.push(target);
      else prerequisites.push(target);
    }
    return { source: 'explicit', prerequisites, ignoredForward, skipped: [] };
  }

  if (!module.sequentialLessons) return NO_PREREQUISITES;

  // Nearest preceding lesson that can actually block. Within the module only:
  // sequencing across the boundary is what module prerequisites already are,
  // and chaining there would gate the same thing twice.
  const skipped: GateLesson[] = [];
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = module.lessons[i];
    if (canBlock(candidate)) {
      return {
        source: 'chain',
        prerequisites: [candidate],
        ignoredForward: [],
        skipped,
      };
    }
    skipped.push(candidate);
  }
  return { source: 'chain', prerequisites: [], ignoredForward: [], skipped };
}

/**
 * Why a lesson is (or isn't) gated by other lessons — the SAME computation the
 * gate runs, exposed so the admin UI renders the real answer rather than a
 * second implementation of the rules.
 *
 * This matters more here than usual: the chain skips lessons and silently
 * drops forward-pointing edges, so an admin reading a reimplementation would
 * have no way to notice the two had drifted.
 */
export function explainLessonPrerequisites(
  course: GateCourse,
  lessonSlug: string,
): LessonPrerequisiteExplanation {
  const found = locate(course, lessonSlug);
  if (!found) return NO_PREREQUISITES;
  return effectivePrerequisites(
    course,
    found.module,
    found.lesson,
    found.index,
  );
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
 * Only direct edges are walked. Transitivity holds because a locked lesson
 * serves no material and records no visit, so it cannot become done, so its
 * dependents stay locked. The one lesson that cannot become done — an
 * unavailable one — is also one that never blocks, so it can never strand a
 * chain. See `canBlock` and `effectivePrerequisites`.
 *
 * Caveat: video progress and the visit are written only past the lesson lock,
 * but section taps (`/api/user/lesson-section`) and quiz answers
 * (`/api/lesson/quiz/answers`) do not yet refuse a locked lesson. Through the
 * app a locked lesson shows no tabs and no quiz, so the argument holds; a
 * hand-crafted request against a lesson with no required video could still
 * complete it out of order.
 *
 * Every lock carries what the learner still has to do (`outstanding`), so the
 * lock copy can name it rather than say "finish the previous lesson".
 */
export function evaluateLessonLock(
  course: GateCourse,
  lessonSlug: string,
  progress: GateProgress,
): LessonLock {
  const found = locate(course, lessonSlug);
  // An unknown lesson is not this function's error to report — callers 404.
  if (!found) return OPEN_LESSON;
  const { module, lesson, index } = found;

  for (const prereqSlug of module.dependsOn) {
    const prereq = course.modules.find((m) => m.slug === prereqSlug);
    if (!prereq) continue;
    const unfinished = prereq.lessons.filter(
      (l) => !isPrerequisiteMet(l, progress),
    );
    if (unfinished.length > 0) {
      const [next] = unfinished;
      return {
        kind: 'module-locked',
        moduleSlug: prereq.slug,
        moduleName: prereq.name,
        lessonsLeft: unfinished.length,
        next: {
          lessonName: next.name,
          outstanding: outstandingOf(progress, next.slug),
        },
      };
    }
  }

  for (const depLesson of effectivePrerequisites(course, module, lesson, index)
    .prerequisites) {
    if (!isPrerequisiteMet(depLesson, progress)) {
      const depModule =
        course.modules.find((m) =>
          m.lessons.some((l) => l.slug === depLesson.slug),
        ) ?? module;
      return {
        kind: 'lesson-locked',
        lessonSlug: depLesson.slug,
        moduleSlug: depModule.slug,
        lessonName: depLesson.name,
        outstanding: outstandingOf(progress, depLesson.slug),
      };
    }
  }

  return OPEN_LESSON;
}

/**
 * Whether the lesson's material is readable, assuming evaluateLessonLock is
 * already open. The lesson's own video controls this gate and no other — so
 * it reads `progress.watched`, never `progress.done`.
 */
export function evaluateMaterialLock(
  course: GateCourse,
  lessonSlug: string,
  progress: GateProgress,
): MaterialLock {
  const found = locate(course, lessonSlug);
  if (!found) return OPEN_MATERIAL;
  return isLessonSatisfied(found.lesson, progress.watched)
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
        lessonsLeft: lessonLock.lessonsLeft,
        next: lessonLock.next,
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
        outstanding: lessonLock.outstanding,
      },
    };
  }
  if (materialLock.kind === 'video-locked') {
    return { locked: true, reason: 'video' };
  }
  return null;
}

/**
 * Whether a `/api/lesson/material` response is an archive view: the pilot
 * completed this lesson at an earlier level and it now sits outside their
 * current one.
 *
 * The single place this is decided, so `computeLessonMainState`,
 * `computeMaterialPanelState`, and `LessonPlayerContainer` (all of which read
 * the same cached query independently) can never disagree about whether a
 * lesson's writes should be inert. `data.locked` is checked defensively even
 * though the two fields are mutually exclusive by type — a locked response
 * never carries `readOnly` — so a malformed or cached-stale payload fails
 * closed (not read-only) rather than accidentally unlocking write-guards.
 */
export function isMaterialReadOnly<TMaterial>(
  data: LessonMaterialResponse<TMaterial> | undefined,
): boolean {
  return data != null && !data.locked && data.readOnly === true;
}
