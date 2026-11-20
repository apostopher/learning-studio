// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import type { CopiedModule, OrgEditorBoard } from '#/lib/admin-schemas';

const lessons = (n: number) => `${n} lesson${n === 1 ? '' : 's'}`;

/**
 * The toast after a library module is copied into a course. Says what came
 * along and — when the course already taught some of its lessons — that
 * those were left where they are, naming them when there are few enough to
 * read. A silent skip would look like lessons lost on the way.
 */
export function copiedModuleMessage(
  copied: CopiedModule,
  courseName: string,
): string {
  const added = `Added "${copied.module.name}" to ${courseName} with ${lessons(copied.placedLessonIds.length)}.`;
  const { skipped } = copied;
  if (skipped.length === 0) return added;
  const which =
    skipped.length <= 3
      ? ` (${skipped.map((l) => `"${l.name}"`).join(', ')})`
      : '';
  const verb = skipped.length === 1 ? 'was' : 'were';
  return `${added} ${lessons(skipped.length)}${which} ${verb} already in ${courseName} and stayed where ${skipped.length === 1 ? 'it is' : 'they are'}.`;
}

/**
 * Where a library module will be copied, said BEFORE the drop: the note under
 * the cursor and the screen-reader announcement. Nothing on the board moves
 * while a library module is carried over a course, so without this the
 * admin is guessing where the new module will appear.
 */
export function copyModuleHint(
  board: OrgEditorBoard,
  target: {
    courseId: number;
    afterModuleId: number | null;
    onlyLessonId?: number;
  },
  moduleName: string,
): string {
  const course = board.find((cb) => cb.course.id === target.courseId);
  const courseName = course?.course.name ?? 'this course';
  const after =
    target.afterModuleId === null
      ? undefined
      : course?.modules.find((m) => m.id === target.afterModuleId)?.name;
  const carrying =
    target.onlyLessonId === undefined ? 'with its lessons' : 'with this lesson';
  return after
    ? `Adds "${moduleName}" to ${courseName}, after "${after}", ${carrying}.`
    : `Adds "${moduleName}" to ${courseName}, ${carrying}.`;
}
