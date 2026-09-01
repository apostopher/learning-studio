import { describe, expect, it, vi } from 'vitest';
import { healDuplicatePlacements } from './heal-duplicate-placements';

/**
 * A fake `q` (the shape `txQ` in import-course.ts satisfies) — genuinely
 * generic, matching `healDuplicatePlacements`'s own parameter type, so it
 * type-checks without a cast. Answers the two queries the function can
 * issue: the ordered `select id from module_lessons ...` (fed
 * `existingRows`) and the `delete ... returning module_id, rank,
 * depends_on` (fed `deletedRows`, the exact rows a real `DELETE ...
 * RETURNING` would hand back for whichever ids were passed).
 */
function fakeQ(opts: {
  existingRows?: Array<{ id: number }>;
  deletedRows?: Array<{ module_id: number; rank: string; depends_on: unknown }>;
}) {
  const { existingRows = [], deletedRows = [] } = opts;
  const calls: { sql: string; params: unknown[] }[] = [];
  const q = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    calls.push({ sql, params });
    if (sql.includes('select id from module_lessons')) {
      return existingRows as unknown as T[];
    }
    if (sql.includes('delete from module_lessons')) {
      return deletedRows as unknown as T[];
    }
    return [] as T[];
  };
  return { q, calls };
}

describe('healDuplicatePlacements', () => {
  it('returns null and issues no delete when the lesson has no placement in this course yet', async () => {
    const { q, calls } = fakeQ({ existingRows: [] });

    const survivorId = await healDuplicatePlacements(q, 9, [40, 41], 'stall-recovery');

    expect(survivorId).toBeNull();
    expect(calls.some((c) => c.sql.includes('delete from module_lessons'))).toBe(
      false,
    );
  });

  it('returns the existing placement id and issues no delete when there is exactly one', async () => {
    const { q, calls } = fakeQ({ existingRows: [{ id: 5 }] });

    const survivorId = await healDuplicatePlacements(q, 9, [40, 41], 'stall-recovery');

    expect(survivorId).toBe(5);
    expect(calls.some((c) => c.sql.includes('delete from module_lessons'))).toBe(
      false,
    );
  });

  // Fix round 5, Minor 1: the delete is the only destructive statement in
  // the whole importer, so it must `returning` the FULL content of what it
  // removes (not just ids) and that content must actually reach the log —
  // a duplicate row's `depends_on` may hold per-course prerequisites an
  // admin authored that the SOURCE database has no record of at all.
  // Mutant: `delete from module_lessons where id = any($1::int[])` with no
  // `returning` clause (fix round 4's original shape) — correct-shaped
  // (still deletes the right rows) but wrong-behaving: nothing removed is
  // ever recoverable from the log. Verified RED against that mutant below.
  it('keeps the lowest id, deletes the rest, returns the survivor, and logs the full contents removed', async () => {
    const deletedRows = [
      { module_id: 41, rank: '2', depends_on: [{ lessonSlug: 'intro' }] },
      { module_id: 40, rank: '3', depends_on: [] },
    ];
    const { q, calls } = fakeQ({
      existingRows: [{ id: 5 }, { id: 7 }, { id: 9 }],
      deletedRows,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const survivorId = await healDuplicatePlacements(q, 9, [40, 41], 'stall-recovery');

    expect(survivorId).toBe(5);
    const deleteCall = calls.find((c) => c.sql.includes('delete from module_lessons'));
    expect(deleteCall?.sql).toContain('returning module_id, rank, depends_on');
    expect(deleteCall?.params).toEqual([[7, 9]]);
    // The actual content of what was destroyed reached the log — not just
    // the ids, and not silently dropped.
    const logged = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('stall-recovery');
    expect(logged).toContain(JSON.stringify(deletedRows));

    logSpy.mockRestore();
  });
});
