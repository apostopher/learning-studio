import type { LibraryLesson, OrgLibrary } from '#/lib/admin-schemas';

/** The library with one lesson changed, in whichever list holds it. */
export function patchLibraryLesson(
  library: OrgLibrary,
  lessonId: number,
  change: (lesson: LibraryLesson) => LibraryLesson,
): OrgLibrary {
  const apply = (lessons: LibraryLesson[]) =>
    lessons.map((l) => (l.id === lessonId ? change(l) : l));
  return {
    ...library,
    untitled: apply(library.untitled),
    disciplines: library.disciplines.map((d) => ({
      ...d,
      untitled: apply(d.untitled),
      modules: d.modules.map((m) => ({ ...m, lessons: apply(m.lessons) })),
    })),
  };
}
