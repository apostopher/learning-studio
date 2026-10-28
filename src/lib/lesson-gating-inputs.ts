import type { OutstandingItem } from '#/lib/course-progress-agg';
import type { GateCourse, GateProgress } from '#/lib/lesson-gating';

/**
 * The subset of the course payload the gate needs. Declared structurally
 * rather than imported from `#/db/course` so this file stays free of drizzle
 * — the sidebar imports it in the browser.
 */
export type DetailsLesson = {
  id: number;
  slug: string;
  name: string;
  isAvailable: boolean;
  hasVideo: boolean;
  needsVideoWatch: boolean;
  levels: readonly string[];
  dependsOn: readonly { lessonSlug: string; moduleSlug?: string }[];
};
export type DetailsModule = {
  id: number;
  slug: string;
  name: string;
  dependsOn: readonly string[];
  /** Whether this module's lessons must be taken in rank order. */
  sequentialLessons: boolean;
  lessons: readonly DetailsLesson[];
};
export type DetailsCourse = { modules: readonly DetailsModule[] };

/** Narrow the cached course payload to the fields the predicate needs. */
export function toGateCourse(details: DetailsCourse): GateCourse {
  return {
    modules: details.modules.map((m) => ({
      slug: m.slug,
      name: m.name,
      dependsOn: m.dependsOn,
      // Defaults to chained when a cached payload predates the column. The
      // cache key bump (course-details-v3) is what actually prevents that;
      // this only decides which way a stale entry would fail, and failing
      // toward "sequenced" matches the column default.
      sequentialLessons: m.sequentialLessons ?? true,
      lessons: m.lessons.map((l) => ({
        slug: l.slug,
        name: l.name,
        isAvailable: l.isAvailable,
        hasVideo: l.hasVideo,
        needsVideoWatch: l.needsVideoWatch,
        levels: l.levels ?? [],
        dependsOn: l.dependsOn,
      })),
    })),
  };
}

function slugsById(details: DetailsCourse): Map<number, string> {
  const slugById = new Map<number, string>();
  for (const module of details.modules) {
    for (const lesson of module.lessons) slugById.set(lesson.id, lesson.slug);
  }
  return slugById;
}

/**
 * Everything the gate reads about this learner, keyed by slug.
 *
 * Progress is keyed by lessonId while the predicate is keyed by slug, so the
 * course payload supplies the id→slug mapping — pass the UNFILTERED payload,
 * so a lesson done at an earlier tier still satisfies a visible lesson's
 * prerequisite. `outstanding` is optional per row: callers that never render
 * lock copy (card resume) leave it out and get an empty list.
 */
export function gateProgress(
  details: DetailsCourse,
  progress: {
    lessons: readonly {
      lessonId: number;
      watched: boolean;
      done: boolean;
      outstanding?: readonly OutstandingItem[];
    }[];
  },
): GateProgress {
  const slugById = slugsById(details);
  const watched = new Set<string>();
  const done = new Set<string>();
  const outstanding = new Map<string, readonly OutstandingItem[]>();
  for (const row of progress.lessons) {
    const slug = slugById.get(row.lessonId);
    if (!slug) continue;
    if (row.watched) watched.add(slug);
    if (row.done) done.add(slug);
    if (row.outstanding) outstanding.set(slug, row.outstanding);
  }
  return { watched, done, outstanding };
}

/**
 * The lesson slugs whose video this user has watched. Library file unlocks
 * still key on this (library ledger D5); lesson gating uses `gateProgress`.
 *
 * Progress is keyed by lessonId while the predicate is keyed by slug, so the
 * course payload supplies the id→slug mapping. Keying by the lesson's video
 * reference instead would break the moment two lessons share a video.
 */
export function watchedLessonSlugs(
  details: DetailsCourse,
  progress: { lessons: readonly { lessonId: number; watched: boolean }[] },
): Set<string> {
  const slugById = slugsById(details);
  const watched = new Set<string>();
  for (const row of progress.lessons) {
    if (!row.watched) continue;
    const slug = slugById.get(row.lessonId);
    if (slug) watched.add(slug);
  }
  return watched;
}
