import type { OrgLibrary } from '#/lib/admin-schemas';

/**
 * Every lesson in the org library as one pickable list: each discipline's
 * modules and Untitled group, then the org-level Untitled column. A lesson
 * filed in more than one place appears once, and the list is alphabetical so
 * a type-to-filter picker reads predictably.
 */
export function flattenLibraryLessons(
  library: OrgLibrary,
): { slug: string; name: string }[] {
  const bySlug = new Map<string, { slug: string; name: string }>();
  const add = (lessons: ReadonlyArray<{ slug: string; name: string }>) => {
    for (const { slug, name } of lessons) {
      if (!bySlug.has(slug)) bySlug.set(slug, { slug, name });
    }
  };
  for (const discipline of library.disciplines) {
    for (const module of discipline.modules) add(module.lessons);
    add(discipline.untitled);
  }
  add(library.untitled);
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}
