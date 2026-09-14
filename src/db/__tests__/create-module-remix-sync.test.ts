// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    inserts: [] as Array<{ table: unknown; values: unknown }>,
    /**
     * Every SELECT issued, tagged by which object it was called on (`db` vs
     * `tx`) and, when present, the `.for(...)` lock strength — this is what
     * proves the remixer read happens INSIDE the transaction, after the lock,
     * rather than merely returning the right rows by coincidence.
     */
    selects: [] as Array<{ source: 'db' | 'tx'; for?: string }>,
  };
  function chain(source: 'db' | 'tx', insertTable?: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    let values: unknown;
    let forArg: string | undefined;
    for (const name of [
      'select',
      'from',
      'where',
      'orderBy',
      'values',
      'returning',
      'innerJoin',
      'leftJoin',
      'limit',
    ]) {
      c[name] = (...args: unknown[]) => {
        if (name === 'values') values = args[0];
        return c;
      };
    }
    c.for = (strength: string) => {
      forArg = strength;
      return c;
    };
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      if (insertTable !== undefined) {
        state.inserts.push({ table: insertTable, values });
      } else {
        state.selects.push({ source, for: forArg });
      }
      return Promise.resolve(state.results.shift() ?? []).then(resolve, reject);
    };
    return c;
  }
  const tx = {
    select: () => chain('tx'),
    insert: (t: unknown) => chain('tx', t),
  };
  const db = {
    select: () => chain('db'),
    insert: (t: unknown) => chain('db', t),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { state, db };
});
vi.mock('#/db', () => ({ db: fake.db }));
// createModule now reads its own remixers, locked, inside the transaction —
// this module's only remaining role for admin.ts is `countRemixers`, used by
// `deleteCourse` (untested here).
vi.mock('#/db/course-remixes', () => ({ countRemixers: vi.fn() }));
const cache = vi.hoisted(() => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/course-cache', () => cache);
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(),
  getCourseSlugForCourseId: vi.fn(async (id: number) => `course-${id}`),
  getCourseSlugForModuleId: vi.fn(),
  getCourseSlugsForLessonId: vi.fn(),
  lessonBelongsToCourseOrg: vi.fn(),
}));
// admin.ts's server-only imports — same stub list as course-board-membership.test.ts.
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: vi.fn() }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: vi.fn(),
  validateCredentials: vi.fn(),
}));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: Object.assign(vi.fn(), { invalidate: vi.fn() }),
}));

const { createModule } = await import('../admin');
const { courseModulesTable } = await import('../schema');

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.results.length = 0;
  fake.state.inserts.length = 0;
  fake.state.selects.length = 0;
});

/** Queue the reads createModule performs before its inserts. */
function seed(opts: { remixers: number[] }) {
  fake.state.results.push([{ id: 6, name: 'Source' }]); // owner course row (name for the payload)
  fake.state.results.push([]); // taken slugs
  fake.state.results.push([{ maxRank: '2' }]); // own max rank
  fake.state.results.push([{ id: 6 }]); // lock select (`for update`) — value unused
  fake.state.results.push(opts.remixers.map((courseId) => ({ courseId }))); // remixer read, inside the tx, after the lock
  fake.state.results.push([
    {
      id: 99,
      name: 'Weather',
      slug: 'weather',
      imageUrlAvif: null,
      imageUrlWebp: null,
      requiredSubscriptions: [],
      sequentialLessons: true,
    },
  ]); // module insert
  fake.state.results.push([]); // own placement insert
  fake.state.results.push([]); // remixer placements insert (if any)
}

describe('createModule → remixers', () => {
  it('appends one placement per remixer, ranked after that remixer’s own last module', async () => {
    seed({ remixers: [2, 5] });
    await createModule({ courseId: 6, name: 'Weather' });

    const remixerInsert = fake.state.inserts.find(
      (i) => i.table === courseModulesTable && Array.isArray(i.values),
    );
    expect(remixerInsert).toBeDefined();
    const rows = remixerInsert?.values as Array<{
      courseId: number;
      moduleId: number;
      rank: SQL;
    }>;
    expect(rows.map((r) => [r.courseId, r.moduleId])).toEqual([
      [2, 99],
      [5, 99],
    ]);
    // Rank is computed IN the remixer, per row — not copied from the source.
    expect(renderSql(rows[0].rank)).toBe(
      'coalesce((select max("course_modules"."rank") from "course_modules" where "course_modules"."course_id" = $1), 0) + 1',
    );
    expect(renderSqlParams(rows[0].rank)).toEqual([2]);
    expect(renderSqlParams(rows[1].rank)).toEqual([5]);
  });

  it('writes no remixer rows when nothing remixes the owner', async () => {
    seed({ remixers: [] });
    await createModule({ courseId: 6, name: 'Weather' });
    const placementInserts = fake.state.inserts.filter(
      (i) => i.table === courseModulesTable,
    );
    expect(placementInserts).toHaveLength(1); // the owner's own placement only
  });

  it('invalidates every remixer’s learner payload as well as the owner’s', async () => {
    seed({ remixers: [2, 5] });
    await createModule({ courseId: 6, name: 'Weather' });
    const slugs = cache.invalidateCourseDetailsCache.mock.calls
      .map((c) => c[0])
      .sort();
    expect(slugs).toEqual(['course-2', 'course-5', 'course-6']);
  });

  /**
   * The race this closes: `remixCourse` reading "who remixes this source"
   * (or committing its link row) between an old, unlocked remixer read and
   * this create's commit would leave the new module missing from the
   * just-added remixer. Locking the source row first — inside the SAME
   * transaction, before the remixer read — makes the two transactions
   * serialise instead: whichever commits second sees the other's effect.
   *
   * Mutant this catches: reading remixers via `db.select` before
   * `db.transaction` opens (the pre-fix shape) — same rows, same result,
   * until a remix commits in the gap between that read and this create's
   * commit.
   */
  it('locks the source course row for update, then reads remixers inside the same transaction', async () => {
    seed({ remixers: [2] });
    await createModule({ courseId: 6, name: 'Weather' });

    // Three plain reads before the transaction opens: owner, taken slugs,
    // own max rank — all issued on `db`, none carrying a lock.
    expect(fake.state.selects.slice(0, 3).every((s) => s.source === 'db')).toBe(
      true,
    );
    expect(
      fake.state.selects.slice(0, 3).every((s) => s.for === undefined),
    ).toBe(true);
    // The lock: issued on `tx`, `for update`, before the remixer read.
    expect(fake.state.selects[3]).toEqual({ source: 'tx', for: 'update' });
    // The remixer read: also on `tx` (inside the transaction), no lock of
    // its own — it rides the source row's lock already held above.
    expect(fake.state.selects[4]).toEqual({ source: 'tx', for: undefined });
  });
});
