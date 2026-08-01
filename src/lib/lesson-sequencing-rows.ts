import type { BoardModule } from '#/lib/admin-schemas';
import {
  explainLessonPrerequisites,
  type GateCourse,
  type GateLesson,
} from '#/lib/lesson-gating';

/**
 * Board shape → the gate's shape, so the admin screen is explained by exactly
 * the predicate that enforces it.
 *
 * `hasVideo: l.isConfigured` mirrors `toDepModule` in the module dependencies
 * container: the board calls a lesson configured once it has a video, which is
 * the same fact `isLessonSatisfied` keys on.
 */
export function toGateCourseFromBoard(
  modules: readonly BoardModule[],
): GateCourse {
  return {
    modules: modules.map((m) => ({
      slug: m.slug,
      name: m.name,
      dependsOn: m.dependsOn,
      sequentialLessons: m.sequentialLessons,
      lessons: m.lessons.map((l) => ({
        slug: l.slug,
        name: l.name,
        isAvailable: l.isAvailable,
        hasVideo: l.isConfigured,
        needsVideoWatch: l.needsVideoWatch,
        dependsOn: l.dependsOn,
      })),
    })),
  };
}

export type SequencingRow = {
  lessonId: number;
  slug: string;
  name: string;
  /** 1-based position within the module, for the leading number. */
  position: number;
  /** Where this lesson's prerequisites come from. */
  source: 'chain' | 'explicit' | 'none';
  /** In force right now, in order. */
  prerequisites: { slug: string; name: string }[];
  /**
   * A one-line explanation of the state, or null when the row is unremarkable.
   * Null for "chained to the lesson right before it", which needs no comment.
   */
  note: string | null;
  /** Slugs offered by the override picker — earlier lessons only. */
  optionSlugs: string[];
};

const names = (lessons: readonly GateLesson[]): string =>
  lessons.map((l) => l.name).join(', ');

/**
 * Why this row's prerequisite is what it is, in one line, or null when it
 * needs no explanation.
 *
 * The skipped and ignored cases are the whole reason this screen exists: both
 * are prerequisites that LOOK configured and do nothing, and nothing else in
 * the system will ever tell an admin about them.
 */
function buildNote(
  explanation: ReturnType<typeof explainLessonPrerequisites>,
  isFirst: boolean,
): string | null {
  const { source, prerequisites, ignoredForward, skipped } = explanation;

  if (source === 'explicit') {
    if (ignoredForward.length > 0 && prerequisites.length === 0) {
      return `${names(ignoredForward)} now comes later in the course, so this prerequisite is ignored — nothing gates this lesson.`;
    }
    if (ignoredForward.length > 0) {
      return `${names(ignoredForward)} now comes later in the course, so that prerequisite is ignored.`;
    }
    return null;
  }

  if (source === 'none') {
    return prerequisites.length === 0 && !isFirst
      ? 'Lessons in this module can be taken in any order.'
      : null;
  }

  // chain
  if (prerequisites.length === 0) {
    return isFirst
      ? 'First lesson — nothing before it.'
      : 'Nothing before this lesson can gate it, so it opens straight away.';
  }
  if (skipped.length > 0) {
    return `Skips ${names(skipped)} — no video to watch there, so ${skipped.length === 1 ? 'it' : 'they'} cannot gate anything.`;
  }
  return null;
}

/**
 * One row per lesson in a module, ready to render.
 *
 * Pure so it can be tested without rendering — the container that would host
 * it calls hooks, which this repo's Vite pipeline cannot render under Vitest,
 * and the branching here (what gates what, and what silently does not) is
 * where the expensive mistakes live.
 */
export function buildSequencingRows(
  course: GateCourse,
  module: BoardModule,
): SequencingRow[] {
  const gateModule = course.modules.find((m) => m.slug === module.slug);
  const lessons = gateModule?.lessons ?? [];

  return module.lessons.map((lesson, index) => {
    const explanation = explainLessonPrerequisites(course, lesson.slug);
    return {
      lessonId: lesson.id,
      slug: lesson.slug,
      name: lesson.name,
      position: index + 1,
      source: explanation.source,
      prerequisites: explanation.prerequisites.map((p) => ({
        slug: p.slug,
        name: p.name,
      })),
      note: buildNote(explanation, index === 0),
      // Earlier lessons in this module only. Not the safety mechanism — the
      // gate drops forward edges regardless — but it stops the common path
      // creating an edge that is dead the moment it is saved.
      optionSlugs: lessons.slice(0, index).map((l) => l.slug),
    };
  });
}
