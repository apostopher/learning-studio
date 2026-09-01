// @vitest-environment node
import { integer, pgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real pgTable columns (not plain object stubs) so `eq()` in the module under
// test builds real query fragments against them — same "fully stub, never
// importOriginal" pattern as lesson-access-course-id.test.ts.
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  disciplineId: integer('discipline_id'),
});

/**
 * A chainable stub standing in for `db.select().from().where().limit()`.
 */
function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

const db = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ lessonsTable }));

const { getDisciplineIdForLessonId } = await import('#/db/lesson-access');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDisciplineIdForLessonId', () => {
  // The core reason this returns a discriminated union rather than a bare
  // `number | null`: these two rows must be tellable apart by the caller.
  it('resolves { found: true, disciplineId: N } for a lesson with a discipline', async () => {
    db.select.mockReturnValueOnce(makeChain([{ disciplineId: 7 }]));

    await expect(getDisciplineIdForLessonId(10)).resolves.toEqual({
      found: true,
      disciplineId: 7,
    });
  });

  it('resolves { found: true, disciplineId: null } for an "Untitled" lesson', async () => {
    db.select.mockReturnValueOnce(makeChain([{ disciplineId: null }]));

    await expect(getDisciplineIdForLessonId(10)).resolves.toEqual({
      found: true,
      disciplineId: null,
    });
  });

  it('resolves { found: false } for a lesson that does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([]));

    await expect(getDisciplineIdForLessonId(999)).resolves.toEqual({
      found: false,
    });
  });

  // Mutant: collapse the union back to `row?.disciplineId ?? null`. Both
  // "no such lesson" and "exists, no discipline" would then resolve to the
  // bare value `null`, indistinguishable to the caller — RED, because this
  // assertion requires `found` to differ between the two cases.
  it('never returns the same shape for "not found" as for "found, no discipline"', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const notFound = await getDisciplineIdForLessonId(999);

    db.select.mockReturnValueOnce(makeChain([{ disciplineId: null }]));
    const foundNoDiscipline = await getDisciplineIdForLessonId(10);

    expect(notFound.found).toBe(false);
    expect(foundNoDiscipline.found).toBe(true);
    expect(notFound).not.toEqual(foundNoDiscipline);
  });
});
