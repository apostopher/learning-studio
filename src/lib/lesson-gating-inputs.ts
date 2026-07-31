import type { GateCourse } from '#/lib/lesson-gating';

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
  dependsOn: readonly { lessonSlug: string; moduleSlug?: string }[];
};
export type DetailsModule = {
  id: number;
  slug: string;
  name: string;
  dependsOn: readonly string[];
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
      lessons: m.lessons.map((l) => ({
        slug: l.slug,
        name: l.name,
        isAvailable: l.isAvailable,
        hasVideo: l.hasVideo,
        needsVideoWatch: l.needsVideoWatch,
        dependsOn: l.dependsOn,
      })),
    })),
  };
}

/**
 * The lesson slugs whose video this user has watched.
 *
 * Progress is keyed by lessonId while the predicate is keyed by slug, so the
 * course payload supplies the id→slug mapping. Keying by videoId instead
 * would break the moment two lessons share a video.
 */
export function watchedLessonSlugs(
  details: DetailsCourse,
  progress: { lessons: readonly { lessonId: number; watched: boolean }[] },
): Set<string> {
  const slugById = new Map<number, string>();
  for (const module of details.modules) {
    for (const lesson of module.lessons) slugById.set(lesson.id, lesson.slug);
  }
  const watched = new Set<string>();
  for (const row of progress.lessons) {
    if (!row.watched) continue;
    const slug = slugById.get(row.lessonId);
    if (slug) watched.add(slug);
  }
  return watched;
}
