import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  where: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
}));
vi.mock('#/db', () => ({
  db: {
    select: (...args: unknown[]) => {
      m.select(...args);
      return {
        from: (t: unknown) => {
          m.from(t);
          return {
            where: (c: unknown) => {
              m.where(c);
              return ['SUBQUERY'];
            },
          };
        },
      };
    },
  },
}));

const { courseModuleIds } = await import('../course-modules');
const { courseModulesTable } = await import('../schema');

describe('courseModuleIds', () => {
  /**
   * Mutant this catches: selecting `courseModulesTable.id` (the row's own key)
   * instead of `moduleId`. Both are integer columns on the same table, both
   * type-check, and the resulting `inArray` would filter modules by placement
   * id — quietly returning the wrong modules rather than none.
   */
  it('selects the MODULE id, from course_modules', () => {
    courseModuleIds(2);
    expect(m.select).toHaveBeenCalledWith({ id: courseModulesTable.moduleId });
    expect(m.from).toHaveBeenCalledWith(courseModulesTable);
    expect(m.where).toHaveBeenCalledOnce();
  });
});
