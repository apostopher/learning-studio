type LessonLike = { slug: string; name: string; videoId: string | null };
type ModuleLike = { slug: string; lessons: readonly LessonLike[] };
type CourseLike = { modules: readonly ModuleLike[] };

export const findLesson = (
  course: CourseLike | undefined,
  moduleSlug: string,
  lessonSlug: string,
): LessonLike | undefined => {
  if (!course) return undefined;
  const mod = course.modules.find((m) => m.slug === moduleSlug);
  return mod?.lessons.find((l) => l.slug === lessonSlug);
};
