export type ShapeableLesson = {
  id: number;
  isAvailable: boolean;
  rank: string;
};
export type ShapeableModule<L extends ShapeableLesson> = { lessons: L[] };

/**
 * Drop WIP lessons and order the rest by rank, in place, for every module.
 *
 * Previously this filter and sort were computed into a local array that was
 * never assigned back, so every `is_available = false` lesson was served to
 * students and modules came back in join order. Pure — no DB access — so
 * it lives here (see src/lib/is-associate.ts for the same rationale) and is
 * importable under vitest without pulling in `@/db` transitively, and is
 * unit tested directly (see __tests__/course-shaping.test.ts).
 */
export function shapeModuleLessons<
  L extends ShapeableLesson,
  M extends ShapeableModule<L>,
>(modules: Iterable<M>): void {
  for (const mod of modules) {
    mod.lessons = mod.lessons
      .filter((lesson) => lesson.isAvailable)
      .sort((a, b) => Number(a.rank) - Number(b.rank));
  }
}
