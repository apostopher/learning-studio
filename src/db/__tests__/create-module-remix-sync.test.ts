// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    inserts: [] as Array<{ table: unknown; values: unknown }>,
  };
  function chain(insertTable?: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    let values: unknown;
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
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      if (insertTable !== undefined)
        state.inserts.push({ table: insertTable, values });
      return Promise.resolve(state.results.shift() ?? []).then(resolve, reject);
    };
    return c;
  }
  const tx = { select: () => chain(), insert: (t: unknown) => chain(t) };
  const db = {
    ...tx,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { state, db };
});
vi.mock('#/db', () => ({ db: fake.db }));
const remixes = vi.hoisted(() => ({
  getRemixerCourseIds: vi.fn(async () => [] as number[]),
}));
vi.mock('#/db/course-remixes', () => remixes);
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
});

/** Queue the reads createModule performs before its inserts. */
function seed(opts: { remixers: number[] }) {
  remixes.getRemixerCourseIds.mockResolvedValue(opts.remixers);
  fake.state.results.push([{ id: 6, name: 'Source' }]); // owner course row (name for the payload)
  fake.state.results.push([]); // taken slugs
  fake.state.results.push([{ maxRank: '2' }]); // own max rank
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
    const rows = remixerInsert!.values as Array<{
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
});
