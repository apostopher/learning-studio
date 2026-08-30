// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported (for real, not mocked) by the drag-rules test.

/**
 * The accessible name and tooltip of a placed lesson's "remove" control.
 *
 * Lives here, shared, because two places have to agree on it: the control
 * itself (`LessonCard` via `EditorLessonCardContainer`) and the drag refusal
 * that tells someone to go and use it (`resolveDrop`). A refusal naming a
 * control by a label the control does not wear is worse than a refusal that
 * says nothing — the reader looks for a button that isn't there. One function,
 * so they cannot drift.
 *
 * Names the lesson as well as the module because the two destructive controls
 * on a card sit two icons apart, and "Remove" on its own says nothing about
 * what it removes the lesson FROM.
 */
export function removeLessonLabel(
  lessonName: string,
  moduleName: string,
): string {
  return `Remove ${lessonName} from ${moduleName}`;
}

/**
 * How many courses teach a lesson, per the org library, or `null` when the
 * library has not loaded (or does not hold the lesson).
 *
 * Shared by both surfaces' lesson cards. `null` is not zero and the two must
 * not be conflated: the delete confirmation says "is not in any course yet"
 * for zero, which would be a flat lie about a lesson currently sitting in a
 * module. Callers offer no delete control at all while the answer is `null`.
 */
export function findLibraryCourseCount(
  library:
    | {
        disciplines: { lessons: { id: number; courseCount: number }[] }[];
        untitled: { id: number; courseCount: number }[];
      }
    | undefined,
  lessonId: number,
): number | null {
  if (!library) return null;
  const card = [
    ...library.untitled,
    ...library.disciplines.flatMap((d) => d.lessons),
  ].find((l) => l.id === lessonId);
  return card?.courseCount ?? null;
}
