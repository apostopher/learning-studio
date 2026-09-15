import { describe, expect, it } from 'vitest';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { commitLibraryDrop } from '../commit-library-drop';

// Not `as const`: the schema's array fields (`courseIds`, `levels`,
// `requiredSubscriptions`) are mutable `T[]`, and a `const`-asserted `[]`
// infers as `readonly never[]`, which tsc refuses to widen back.
const lesson = (
  id: number,
  disciplineModuleId: number | null,
): LibraryLesson => ({
  id,
  name: `L${id}`,
  slug: `l${id}`,
  isConfigured: false,
  isAvailable: true,
  courseCount: 0,
  courseIds: [],
  videoProvider: null,
  disciplineModuleId,
  levels: [],
  requiredSubscriptions: [],
  hasDebrief: false,
  needsVideoWatch: false,
});

/** The library AFTER the optimistic preview has placed the lesson. */
const previewed = {
  untitled: [],
  disciplines: [
    {
      id: 4,
      name: 'Weather',
      slug: 'weather',
      modules: [
        {
          id: 7,
          name: 'Basics',
          rank: 1,
          lessons: [lesson(2, 7), lesson(1, 7), lesson(5, 7)],
        },
      ],
      untitled: [lesson(3, null)],
    },
  ],
};

describe('commitLibraryDrop', () => {
  /**
   * The body the server receives names the lesson's NEW neighbours as the
   * preview shows them — that is what makes the persisted order match what
   * the admin watched happen. Mutant: neighbours read from the pre-drag
   * library, which would file the lesson where it started.
   */
  it('a library-move commits the module and the previewed neighbours', () => {
    expect(
      commitLibraryDrop(
        {
          kind: 'library-move',
          lessonId: 1,
          disciplineId: 4,
          disciplineModuleId: 7,
          overId: 'library-lesson-5',
        },
        previewed,
      ),
    ).toEqual({
      kind: 'place',
      vars: {
        lessonId: 1,
        disciplineModuleId: 7,
        prevLessonId: 2,
        nextLessonId: 5,
      },
    });
  });
  it('a reorder commits the module’s previewed neighbours', () => {
    const lib = {
      ...previewed,
      disciplines: [
        {
          ...previewed.disciplines[0],
          modules: [
            { id: 8, name: 'Advanced', rank: 2, lessons: [] },
            { id: 7, name: 'Basics', rank: 1, lessons: [] },
          ],
        },
      ],
    };
    expect(
      commitLibraryDrop(
        {
          kind: 'reorder-library-module',
          disciplineId: 4,
          moduleId: 7,
          overModuleId: 8,
        },
        lib,
      ),
    ).toEqual({
      kind: 'reorder',
      vars: { moduleId: 7, prevModuleId: 8, nextModuleId: null },
    });
  });
});
