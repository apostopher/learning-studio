import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  where: vi.fn((_c: unknown): unknown => ['SUBQUERY']),
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
            where: (c: unknown) => m.where(c),
          };
        },
      };
    },
  },
}));

const { courseModuleIds, getCourseModuleIds } = await import('../course-modules');
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

describe('getCourseModuleIds', () => {
  /**
   * Asserts on what the consumer received: the resolved, mapped array of
   * module ids, not merely that the query was constructed.
   */
  it('awaits the query and maps rows to module ids', async () => {
    m.where.mockReturnValueOnce([{ id: 10 }, { id: 19 }]);
    const result = await getCourseModuleIds(2);
    expect(result).toEqual([10, 19]);
  });
});
