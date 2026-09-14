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

/**
 * Rail kinds are qualified by COURSE. A module — and every lesson placed in
 * it — can sit on two rails at once through a remix, and dnd-kit ids must be
 * unique inside the one `DndContext` both panes share; `module-10` twice is
 * two sortables fighting over one id, and a lookup by module id alone lands
 * on whichever column comes first. The course id makes each registration
 * unique and every lookup column-scoped.
 */
export const moduleDndId = (courseId: number, moduleId: number) =>
  `module-${courseId}-${moduleId}`;
export const lessonDndId = (courseId: number, lessonId: number) =>
  `lesson-${courseId}-${lessonId}`;
/** Droppable wrapping a module's lesson area (so empty modules accept drops). */
export const containerDndId = (courseId: number, moduleId: number) =>
  `container-${courseId}-${moduleId}`;
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

export type ParsedDndId =
  | { type: 'module' | 'lesson' | 'container'; courseId: number; id: number }
  | {
      type: 'library-lesson' | 'discipline' | 'course';
      id: number;
      courseId?: undefined;
    };

const RAIL_TYPES = new Set(['module', 'lesson', 'container']);
const FLAT_TYPES = new Set(['library-lesson', 'discipline', 'course']);

export function parseDndId(id: string | number): ParsedDndId | null {
  const raw = String(id);
  // Rail ids end in TWO numbers; flat ids in one. Match from the end so a
  // type name containing a hyphen (`library-lesson`) cannot be split apart.
  const rail = /^(.+)-(\d+)-(\d+)$/.exec(raw);
  if (rail && RAIL_TYPES.has(rail[1])) {
    return {
      type: rail[1] as 'module' | 'lesson' | 'container',
      courseId: Number(rail[2]),
      id: Number(rail[3]),
    };
  }
  const flat = /^(.+)-(\d+)$/.exec(raw);
  if (flat && FLAT_TYPES.has(flat[1])) {
    return {
      type: flat[1] as 'library-lesson' | 'discipline' | 'course',
      id: Number(flat[2]),
    };
  }
  return null;
}
