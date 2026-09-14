/**
 * Lessons a course teaches more than once, with every module holding each.
 *
 * Whole-course remixing makes this common — the remixer's own module already
 * teaches a lesson the source's module also teaches — and the spec says to
 * SURFACE it, not block it (`healDuplicatePlacements` exists for exactly this
 * shape). The editor draws a chip on each card; the caller removes the card's
 * own module from the list before rendering.
 */
export function duplicateLessonNotes(
  modules: ReadonlyArray<{
    name: string;
    lessons: ReadonlyArray<{ id: number }>;
  }>,
): Map<number, string[]> {
  const holders = new Map<number, string[]>();
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      holders.set(lesson.id, [...(holders.get(lesson.id) ?? []), mod.name]);
    }
  }
  return new Map([...holders].filter(([, names]) => names.length > 1));
}
