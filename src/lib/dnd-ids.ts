/**
 * Namespaced dnd-kit identifiers for the knowledge library editor. The
 * library (lessons grouped into discipline columns) and the course rail
 * (modules holding placed lessons) share ONE DndContext, and their DB ids
 * can collide across kinds (a library lesson id vs a placed lesson id vs a
 * module id), so every draggable/droppable id is prefixed by type.
 *
 * `lesson` is a lesson already placed inside a module. `library-lesson` is a
 * lesson card in the library pane — dragging one links it into a course, it
 * does not move an existing placement. Keep these distinct.
 */

export type DndType =
  | 'module'
  | 'lesson'
  | 'container'
  | 'library-lesson'
  | 'discipline'
  | 'course';

export const moduleDndId = (id: number) => `module-${id}`;
export const lessonDndId = (id: number) => `lesson-${id}`;
/** Droppable wrapping a module's lesson area (so empty modules accept drops). */
export const containerDndId = (moduleId: number) => `container-${moduleId}`;
/** A lesson card in the library pane, distinct from a placed `lesson`. */
export const libraryLessonDndId = (id: number) => `library-lesson-${id}`;
/** A discipline column in the library — a real droppable so a drop onto it
 *  can be explicitly refused with a reason, rather than looking identical to
 *  a drop on nothing. */
export const disciplineDndId = (id: number) => `discipline-${id}`;
/** A course column with no modules — a real droppable so a lesson dropped on
 *  an empty course can be refused with the reason (there is nowhere to put it
 *  yet) rather than looking identical to a drop on nothing. */
export const courseDndId = (id: number) => `course-${id}`;

export function parseDndId(
  id: string | number,
): { type: DndType; id: number } | null {
  // Split on the LAST hyphen, not the first: `library-lesson-5` and
  // `discipline-5` have hyphens inside the type name itself, so splitting on
  // the first hyphen misreads `library-lesson-5` as prefix "library" / rest
  // "lesson" (NaN) and silently returns null for every library lesson id.
  const raw = String(id);
  const at = raw.lastIndexOf('-');
  if (at === -1) return null;
  const prefix = raw.slice(0, at);
  const num = Number(raw.slice(at + 1));
  if (!Number.isInteger(num)) return null;
  if (prefix === 'module') return { type: 'module', id: num };
  if (prefix === 'lesson') return { type: 'lesson', id: num };
  if (prefix === 'container') return { type: 'container', id: num };
  if (prefix === 'library-lesson') return { type: 'library-lesson', id: num };
  if (prefix === 'discipline') return { type: 'discipline', id: num };
  if (prefix === 'course') return { type: 'course', id: num };
  return null;
}
