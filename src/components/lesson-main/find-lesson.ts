type LessonLike = { slug: string };
type ModuleLike<L> = { slug: string; lessons: readonly L[] };
type CourseLike<L> = { modules: readonly ModuleLike<L>[] };

/**
 * Locate a lesson by module and lesson slug.
 *
 * Generic over the lesson type, and returns it unchanged, so each caller
 * declares only the fields it actually reads: `compute-lesson-header-state`
 * wants a name, `compute-lesson-main-state` wants `hasVideo`, `hasDebrief` and
 * `needsVideoWatch` as well. A fixed lesson shape would force the header — and
 * its tests — to fabricate fields it never touches, and every field added for
 * one caller would break the other.
 */
export const findLesson = <L extends LessonLike>(
  course: CourseLike<L> | undefined,
  moduleSlug: string,
  lessonSlug: string,
): L | undefined => {
  if (!course) return undefined;
  const mod = course.modules.find((m) => m.slug === moduleSlug);
  return mod?.lessons.find((l) => l.slug === lessonSlug);
};
