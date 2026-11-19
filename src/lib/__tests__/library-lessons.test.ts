import { describe, expect, it } from 'vitest';
import type { LibraryLesson, OrgLibrary } from '#/lib/admin-schemas';
import { flattenLibraryLessons } from '#/lib/library-lessons';

function lesson(id: number, slug: string, name: string): LibraryLesson {
  return {
    id,
    slug,
    name,
    isConfigured: true,
    isAvailable: true,
    courseCount: 0,
    courseIds: [],
    videoProvider: null,
    disciplineModuleId: null,
    levels: [],
    requiredSubscriptions: [],
    hasDebrief: false,
    needsVideoWatch: false,
  };
}

describe('flattenLibraryLessons', () => {
  it('flattens, dedupes and sorts library lessons', () => {
    const crosswind = lesson(1, 'crosswind-landings', 'Crosswind landings');
    const library: OrgLibrary = {
      disciplines: [
        {
          id: 1,
          name: 'Flying',
          slug: 'flying',
          modules: [
            {
              id: 10,
              name: 'Landings',
              rank: 0,
              lessons: [crosswind, lesson(2, 'go-arounds', 'Go-arounds')],
            },
          ],
          untitled: [lesson(3, 'airspace', 'Airspace')],
        },
        {
          id: 2,
          name: 'Ops',
          slug: 'ops',
          modules: [],
          // The same lesson again, from another place.
          untitled: [crosswind],
        },
      ],
      untitled: [lesson(4, 'weather', 'Weather basics')],
    };

    expect(flattenLibraryLessons(library)).toEqual([
      { slug: 'airspace', name: 'Airspace' },
      { slug: 'crosswind-landings', name: 'Crosswind landings' },
      { slug: 'go-arounds', name: 'Go-arounds' },
      { slug: 'weather', name: 'Weather basics' },
    ]);
  });
});
