// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { OrgLibrary } from '#/lib/admin-schemas';
import { libraryLessonDndId } from '#/lib/dnd-ids';
import { describeDndTarget } from '../describe-dnd-target';

const lesson = (id: number, disciplineModuleId: number | null) =>
  ({
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
  }) satisfies OrgLibrary['untitled'][number];

const library: OrgLibrary = {
  untitled: [lesson(9, null)],
  disciplines: [
    {
      id: 4,
      name: 'Weather',
      slug: 'weather',
      modules: [{ id: 7, name: 'Basics', rank: 1, lessons: [lesson(1, 7)] }],
      untitled: [lesson(2, null)],
    },
  ],
};

describe('describeDndTarget', () => {
  /**
   * A library-lesson card is itself the usual `over` target for a
   * `library-move` (the sortable cards are droppables among their siblings),
   * so without naming the BOX, every such drop announced "Will file in
   * library lesson Foo" — the sibling card's own name, not where it is
   * landing.
   */
  it('names a library lesson filed in a discipline module', () => {
    expect(describeDndTarget(libraryLessonDndId(1), null, library)).toBe(
      'library lesson L1 in Basics, Weather',
    );
  });

  it("names a library lesson in a discipline's own Untitled group", () => {
    expect(describeDndTarget(libraryLessonDndId(2), null, library)).toBe(
      'library lesson L2 in Untitled, Weather',
    );
  });

  it('names a library lesson in the org-level Untitled column with no discipline to name', () => {
    expect(describeDndTarget(libraryLessonDndId(9), null, library)).toBe(
      'library lesson L9 in Untitled',
    );
  });
});
