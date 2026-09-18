// `#/` not `@/`: this module is pure and sits beside `resolve-drop.ts`, which
// its test imports directly; keeping the alias consistent avoids a resolution
// trap the moment a test reaches for either.
import {
  disciplineLessons,
  type LibraryDiscipline,
  type LibraryLesson,
  type OrgEditorBoard,
  type OrgLibrary,
} from '#/lib/admin-schemas';
import { parseDndId, UNTITLED_DISCIPLINE_ID } from '#/lib/dnd-ids';

/** The library card for a lesson id, across disciplines and the untitled column. */
export function findLibraryLesson(
  library: OrgLibrary | undefined,
  lessonId: number | null,
): LibraryLesson | undefined {
  if (!library || lessonId == null) return undefined;
  return [
    ...library.untitled,
    ...library.disciplines.flatMap((d) => disciplineLessons(d)),
  ].find((l) => l.id === lessonId);
}

/** A discipline module found by walking every discipline, with the
 *  discipline that owns it — for naming it in an announcement. */
function findLibraryModuleWithDiscipline(
  library: OrgLibrary | undefined,
  moduleId: number,
) {
  if (!library) return null;
  for (const discipline of library.disciplines) {
    const module = discipline.modules.find((m) => m.id === moduleId);
    if (module) return { discipline, module };
  }
  return null;
}

/** A library lesson found by walking the library, WITH the box it sits in —
 *  mirrors `resolve-drop.ts`'s own (private) `findLibraryLesson` walk order:
 *  each discipline's modules, then its own Untitled group, then the
 *  org-level Untitled column. `discipline: null` means the org-level
 *  Untitled column; `moduleName: null` with a non-null `discipline` means
 *  that discipline's own Untitled group. */
interface LocatedLibraryLesson {
  lesson: LibraryLesson;
  discipline: LibraryDiscipline | null;
  moduleName: string | null;
}
function locateLibraryLesson(
  library: OrgLibrary | undefined,
  lessonId: number,
): LocatedLibraryLesson | null {
  if (!library) return null;
  for (const discipline of library.disciplines) {
    for (const module of discipline.modules) {
      const lesson = module.lessons.find((l) => l.id === lessonId);
      if (lesson) return { lesson, discipline, moduleName: module.name };
    }
    const untitled = discipline.untitled.find((l) => l.id === lessonId);
    if (untitled) return { lesson: untitled, discipline, moduleName: null };
  }
  const orphan = library.untitled.find((l) => l.id === lessonId);
  if (orphan) return { lesson: orphan, discipline: null, moduleName: null };
  return null;
}

/**
 * A dnd id as a phrase a screen reader can read back.
 *
 * A `library-lesson` over id names the BOX the lesson sits in, not just the
 * card — a lesson card is itself the usual sortable `over` target for a
 * `library-move`, so without this every such drop announced "Will file in
 * library lesson Foo" (naming the sibling card the pointer happened to land
 * near) instead of the module or Untitled group it is actually filing into.
 */
export function describeDndTarget(
  id: string | number,
  board: OrgEditorBoard | null,
  library: OrgLibrary | undefined,
): string {
  const parsed = parseDndId(id);
  if (!parsed) return 'nothing';
  if (parsed.type === 'library-lesson') {
    const located = locateLibraryLesson(library, parsed.id);
    if (!located) return `library lesson ${parsed.id}`;
    const box = located.discipline
      ? `${located.moduleName ?? 'Untitled'}, ${located.discipline.name}`
      : 'Untitled';
    return `library lesson ${located.lesson.name} in ${box}`;
  }
  if (parsed.type === 'library-module' || parsed.type === 'library-container') {
    // Found by walking the library, never by trusting anything about the id
    // beyond what it names — the same reasoning `resolveDrop` follows.
    const found = findLibraryModuleWithDiscipline(library, parsed.id);
    return found
      ? `${found.module.name} in ${found.discipline.name}`
      : String(id);
  }
  if (parsed.type === 'library-untitled') {
    const name =
      library?.disciplines.find((d) => d.id === parsed.id)?.name ??
      String(parsed.id);
    return `Untitled in ${name}`;
  }
  if (parsed.type === 'discipline') {
    // The org-level column is the Untitled bag itself — a real drop target
    // (a lesson released there loses its discipline), not a grouping.
    if (parsed.id === UNTITLED_DISCIPLINE_ID) return 'Untitled';
    const name =
      library?.disciplines.find((d) => d.id === parsed.id)?.name ??
      String(parsed.id);
    return `the ${name} discipline column`;
  }
  if (!board) return String(id);
  if (parsed.type === 'course') {
    // Named explicitly rather than falling through to the module loop below,
    // which would match a MODULE whose id happened to equal this course's and
    // announce the wrong thing. Reachable now that a module drag can land on
    // an empty course column.
    const courseBoard = board.find((cb) => cb.course.id === parsed.id);
    return courseBoard ? `the ${courseBoard.course.name} column` : String(id);
  }
  if (parsed.type === 'lesson') {
    // A remixed module — and its lessons — can render in two columns; name
    // the course the dragged/hovered CARD actually belongs to, not whichever
    // column happens to appear first on the board.
    for (const cb of board) {
      if (cb.course.id !== parsed.courseId) continue;
      for (const mod of cb.modules) {
        const lesson = mod.lessons.find((l) => l.id === parsed.id);
        if (lesson) return `${lesson.name} in ${mod.name}, ${cb.course.name}`;
      }
    }
    return String(id);
  }
  for (const cb of board) {
    if (cb.course.id !== parsed.courseId) continue;
    const mod = cb.modules.find((m) => m.id === parsed.id);
    if (mod) return `${mod.name} in ${cb.course.name}`;
  }
  return String(id);
}
