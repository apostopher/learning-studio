import { describe, expect, it } from 'vitest';
import { disciplineLessons } from '#/lib/admin-schemas';

describe('disciplineLessons', () => {
  /**
   * The ONE definition of "which lessons are in this discipline" now that
   * the flat list is gone: every module's lessons in module order, then
   * Untitled. Mutant: forgetting `untitled`, which drops every existing
   * lesson from the dialog's lookup on day one.
   */
  it('walks every module in order, then Untitled, dropping nothing', () => {
    const l = (id: number) => ({ id }) as never;
    const d = {
      modules: [{ lessons: [l(3), l(1)] }, { lessons: [l(2)] }],
      untitled: [l(9), l(4)],
    };
    expect(disciplineLessons(d).map((x: { id: number }) => x.id)).toEqual([
      3, 1, 2, 9, 4,
    ]);
  });
});
