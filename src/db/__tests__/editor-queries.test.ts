// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import { disciplineLessons } from '#/lib/admin-schemas';

// Task 8: `#/db/editor.ts` reads the org-level library (lessons grouped by
// discipline, org-scoped) and the org's rail of course boards. Real `pgTable`
// stubs for the tables this module actually queries, `#/db`, `#/db/admin`
// and `#/db/placements` fully mocked — never `importOriginal` (see memory:
// vitest can't resolve @/, use #/).
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  name: text('name'),
  slug: text('slug'),
  isAvailable: boolean('is_available'),
  videoRef: text('video_ref'),
  disciplineId: integer('discipline_id'),
  disciplineModuleId: integer('discipline_module_id'),
  libraryRank: text('library_rank'),
  orgId: integer('org_id'),
});
const disciplinesTable = pgTable('disciplines', {
  id: integer('id').primaryKey(),
  name: text('name'),
  slug: text('slug'),
  orgId: integer('org_id'),
});
const disciplineModulesTable = pgTable('discipline_modules', {
  id: integer('id').primaryKey(),
  disciplineId: integer('discipline_id'),
  name: text('name'),
  rank: text('rank'),
});
const courseOrgsTable = pgTable('course_orgs', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  orgId: integer('org_id'),
});

/**
 * Chainable stub for a single drizzle query — house pattern from
 * `placements.test.ts`. Ignores every argument, so it can drive control flow
 * and canned rows but can't prove which table/column a query actually
 * targeted.
 */
function makeChain(result: unknown) {
  const p = Promise.resolve(result) as Promise<unknown> &
    Record<string, () => unknown>;
  Object.assign(p, {
    from: () => p,
    leftJoin: () => p,
    innerJoin: () => p,
    where: () => p,
    orderBy: () => p,
  });
  return p;
}

/**
 * Variant of `makeChain` that records every condition passed to `.where()`,
 * in call order — modelled on `makeCapturingChain` in
 * `library-placement-scoping.test.ts`. Needed to prove the org scope: plain
 * `makeChain` discards its arguments, so a query with no WHERE at all (every
 * org's lessons) would satisfy every other test in this file.
 */
function makeCapturingChain(result: unknown, whereCalls: SQL[]) {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: (condition: SQL) => {
      whereCalls.push(condition);
      return chain;
    },
    orderBy: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const db = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({
  lessonsTable,
  disciplinesTable,
  disciplineModulesTable,
  courseOrgsTable,
}));
vi.mock('#/db/admin', () => ({ getCourseBoard: vi.fn() }));
vi.mock('#/db/placements', () => ({ getCourseIdsForLessons: vi.fn() }));

const { getOrgLibrary, getOrgEditorBoard } = await import('#/db/editor');
const { getCourseBoard } = await import('#/db/admin');
const { getCourseIdsForLessons } = await import('#/db/placements');

const mockGetCourseBoard = vi.mocked(getCourseBoard);
const mockGetCourseIds = vi.mocked(getCourseIdsForLessons);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no lesson is in any course, so a test that doesn't care about
  // course membership still gets a defined map back rather than undefined.
  mockGetCourseIds.mockResolvedValue(new Map());
  // `getOrgLibrary` issues THREE selects — the lesson rows, the org's
  // disciplines, then the org's discipline modules. A test that only queues
  // the first would otherwise get `undefined` back for the rest and die on
  // `.from` before asserting anything. Queued `mockReturnValueOnce` values
  // still take precedence.
  db.select.mockReturnValue(makeChain([]));
});

/**
 * A lesson row as `getOrgLibrary`'s first select returns it: (id, name, slug,
 * isAvailable, videoRef, videoProvider, disciplineId, disciplineName,
 * disciplineSlug, disciplineModuleId, libraryRank). `over` supplies the
 * fields a given test cares about; everything else is filler.
 */
function row(over: Record<string, unknown>) {
  return {
    name: 'L',
    slug: 'l',
    isAvailable: true,
    videoRef: null,
    videoProvider: null,
    disciplineName: 'Weather',
    disciplineSlug: 'weather',
    levels: [],
    requiredSubscriptions: [],
    hasDebrief: false,
    needsVideoWatch: false,
    ...over,
  };
}

describe('getOrgLibrary', () => {
  it('files a null-discipline lesson under untitled, not a discipline', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 9,
          name: 'Stalls',
          slug: 'stalls',
          isAvailable: true,
          videoRef: 'abc',
          disciplineId: null,
          disciplineName: null,
          disciplineSlug: null,
        },
      ]),
    );

    const lib = await getOrgLibrary(1);

    expect(lib.untitled.map((l) => l.id)).toEqual([9]);
    // Mutant this catches: an implementation that always builds a synthetic
    // "Untitled" discipline row instead of the separate `untitled` array
    // would leave `disciplines` non-empty here.
    expect(lib.disciplines.flatMap((d) => disciplineLessons(d))).toEqual([]);
  });

  it('groups a lesson under its real discipline, not untitled', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 4,
          name: 'Loops',
          slug: 'loops',
          isAvailable: true,
          videoRef: 'ref',
          disciplineId: 7,
          disciplineName: 'Aerobatics',
          disciplineSlug: 'aerobatics',
        },
      ]),
    );

    const lib = await getOrgLibrary(1);

    // Mutant this catches: swapping the `row.disciplineId === null` branch
    // condition (e.g. always taking the untitled branch, or checking
    // `!row.disciplineId` and mis-treating id `0` as untitled) would either
    // leave `disciplines` empty or misclassify this lesson.
    expect(lib.untitled).toEqual([]);
    expect(lib.disciplines).toHaveLength(1);
    expect(lib.disciplines[0]).toMatchObject({
      id: 7,
      name: 'Aerobatics',
      slug: 'aerobatics',
    });
    expect(disciplineLessons(lib.disciplines[0]).map((l) => l.id)).toEqual([4]);
  });

  it('carries the course count each card shows', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 9,
          name: 'Stalls',
          slug: 'stalls',
          isAvailable: true,
          videoRef: 'abc',
          videoProvider: 'mux',
          disciplineId: null,
          disciplineName: null,
          disciplineSlug: null,
        },
      ]),
    );
    mockGetCourseIds.mockResolvedValue(new Map([[9, [2, 6]]]));

    const lib = await getOrgLibrary(1);

    // Mutant this catches: hardcoding `courseCount: 0` (or any constant)
    // instead of deriving it from the ids keyed by lesson id — and dropping
    // the ids themselves, which the library's lesson dialog reads to sign
    // its video preview with the first course teaching the lesson.
    expect(lib.untitled[0].courseCount).toBe(2);
    expect(lib.untitled[0].courseIds).toEqual([2, 6]);
    // The provider NAME travels (the library dialog labels the current
    // video with it); the ref never does — see the `videoRef` assertion in
    // the editor-board test below.
    expect(lib.untitled[0].videoProvider).toBe('mux');
    expect(Object.hasOwn(lib.untitled[0], 'videoRef')).toBe(false);
  });

  it('gives an unplaced lesson a count of zero rather than omitting it', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 9,
          name: 'Stalls',
          slug: 'stalls',
          isAvailable: true,
          videoRef: 'abc',
          disciplineId: null,
          disciplineName: null,
          disciplineSlug: null,
        },
      ]),
    );
    mockGetCourseIds.mockResolvedValue(new Map());

    const lib = await getOrgLibrary(1);

    // Mutant this catches: filtering the lesson list down to `counts.has(id)`
    // before building cards — the lesson would vanish instead of reporting 0.
    expect(lib.untitled).toHaveLength(1);
    expect(lib.untitled[0].courseCount).toBe(0);
    expect(lib.untitled[0].courseIds).toEqual([]);
  });

  it('scopes the lesson query to this org, not every org', async () => {
    const whereCalls: SQL[] = [];
    db.select.mockReturnValueOnce(makeCapturingChain([], whereCalls));

    await getOrgLibrary(9);

    expect(whereCalls).toHaveLength(1);
    // Mutant this catches: scoping by `disciplines.org_id` instead of
    // `lessons.org_id` (both exist in the schema — the wrong one would still
    // "look" org-scoped), or dropping the WHERE and returning every org's
    // library.
    expect(renderSql(whereCalls[0])).toBe('"lessons"."org_id" = $1');
    expect(renderSqlParams(whereCalls[0])).toEqual([9]);
  });

  it('gives a discipline holding no lessons a column of its own', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    db.select.mockReturnValueOnce(
      makeChain([{ id: 7, name: 'Aerobatics', slug: 'aerobatics' }]),
    );
    db.select.mockReturnValueOnce(makeChain([]));

    const lib = await getOrgLibrary(1);

    // Mutant this catches: building the discipline map from the lesson rows
    // alone (the original implementation). A discipline created a moment ago
    // has no lessons joined to it, so it would be absent here — and the
    // screen that just created it would show nothing new.
    expect(lib.disciplines).toEqual([
      {
        id: 7,
        name: 'Aerobatics',
        slug: 'aerobatics',
        modules: [],
        untitled: [],
      },
    ]);
  });

  it('orders columns by the disciplines query, not by the order lessons arrive', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 4,
          name: 'Loops',
          slug: 'loops',
          isAvailable: true,
          videoRef: 'ref',
          disciplineId: 9,
          disciplineName: 'Weather',
          disciplineSlug: 'weather',
        },
      ]),
    );
    db.select.mockReturnValueOnce(
      makeChain([
        { id: 7, name: 'Aerobatics', slug: 'aerobatics' },
        { id: 9, name: 'Weather', slug: 'weather' },
      ]),
    );
    db.select.mockReturnValueOnce(makeChain([]));

    const lib = await getOrgLibrary(1);

    // Mutant this catches: seeding the map only for disciplines that already
    // have lessons, or appending seeded rows AFTER the lesson pass — either
    // way 'Weather' (the one with a lesson) leads and the column order stops
    // being the alphabetical order the query asked for.
    expect(lib.disciplines.map((d) => d.name)).toEqual([
      'Aerobatics',
      'Weather',
    ]);
    expect(disciplineLessons(lib.disciplines[1]).map((l) => l.id)).toEqual([4]);
  });

  it('still shows a lesson whose discipline the seed did not return', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 4,
          name: 'Loops',
          slug: 'loops',
          isAvailable: true,
          videoRef: 'ref',
          disciplineId: 7,
          disciplineName: 'Aerobatics',
          disciplineSlug: 'aerobatics',
        },
      ]),
    );
    db.select.mockReturnValueOnce(makeChain([]));
    db.select.mockReturnValueOnce(makeChain([]));

    const lib = await getOrgLibrary(1);

    // Mutant this catches: dropping the "create the discipline if the seed
    // has no entry" branch once the seed exists — the lesson would vanish
    // from the board entirely, or land in `untitled` under a name that is
    // not its own.
    expect(lib.untitled).toEqual([]);
    expect(lib.disciplines).toHaveLength(1);
    expect(lib.disciplines[0].name).toBe('Aerobatics');
    expect(disciplineLessons(lib.disciplines[0]).map((l) => l.id)).toEqual([4]);
  });

  it('scopes the disciplines seed to this org too', async () => {
    const whereCalls: SQL[] = [];
    db.select.mockReturnValueOnce(makeChain([]));
    db.select.mockReturnValueOnce(makeCapturingChain([], whereCalls));
    db.select.mockReturnValueOnce(makeChain([]));

    await getOrgLibrary(9);

    // Mutant this catches: seeding from EVERY org's disciplines. The library
    // would then advertise another tenant's subject list as empty columns —
    // a disclosure that no lesson-level scoping can undo, because the columns
    // carry no lessons to be scoped.
    expect(whereCalls).toHaveLength(1);
    expect(renderSql(whereCalls[0])).toBe('"disciplines"."org_id" = $1');
    expect(renderSqlParams(whereCalls[0])).toEqual([9]);
  });

  it('groups a discipline’s lessons by module in rank order, then Untitled, each in library_rank order with unranked last', async () => {
    db.select
      .mockReturnValueOnce(
        makeChain([
          // lessons: (id, name, slug, isAvailable, videoRef, videoProvider, disciplineId, disciplineName, disciplineSlug, disciplineModuleId, libraryRank)
          row({
            id: 1,
            disciplineId: 4,
            disciplineModuleId: 7,
            libraryRank: '2',
          }),
          row({
            id: 2,
            disciplineId: 4,
            disciplineModuleId: 7,
            libraryRank: '1',
          }),
          row({
            id: 3,
            disciplineId: 4,
            disciplineModuleId: null,
            libraryRank: null,
          }),
          row({
            id: 5,
            disciplineId: 4,
            disciplineModuleId: null,
            libraryRank: '0.5',
          }),
          row({
            id: 6,
            disciplineId: 4,
            disciplineModuleId: 8,
            libraryRank: null,
          }),
        ]),
      )
      .mockReturnValueOnce(
        makeChain([{ id: 4, name: 'Weather', slug: 'weather' }]),
      )
      .mockReturnValueOnce(
        makeChain([
          { id: 8, disciplineId: 4, name: 'Advanced', rank: '2' },
          { id: 7, disciplineId: 4, name: 'Basics', rank: '1' },
        ]),
      );
    mockGetCourseIds.mockResolvedValue(new Map());

    const lib = await getOrgLibrary(1);
    const weather = lib.disciplines[0];
    expect(
      weather.modules.map((m) => [m.id, m.lessons.map((l) => l.id)]),
    ).toEqual([
      [7, [2, 1]],
      [8, [6]],
    ]);
    expect(weather.untitled.map((l) => l.id)).toEqual([5, 3]);
    expect(weather.untitled[0].disciplineModuleId).toBeNull();
    expect(weather.modules[0].lessons[0].disciplineModuleId).toBe(7);
    // Every lesson exactly once.
    const all = [
      ...weather.modules.flatMap((m) => m.lessons),
      ...weather.untitled,
    ]
      .map((l) => l.id)
      .sort();
    expect(all).toEqual([1, 2, 3, 5, 6]);
    expect(Object.hasOwn(weather, 'lessons')).toBe(false);
  });

  it('a module with no lessons is still a box', async () => {
    db.select
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(
        makeChain([{ id: 4, name: 'Weather', slug: 'weather' }]),
      )
      .mockReturnValueOnce(
        makeChain([{ id: 7, disciplineId: 4, name: 'Basics', rank: '1' }]),
      );
    mockGetCourseIds.mockResolvedValue(new Map());
    const lib = await getOrgLibrary(1);
    expect(lib.disciplines[0].modules).toEqual([
      { id: 7, name: 'Basics', rank: 1, lessons: [] },
    ]);
    expect(lib.disciplines[0].untitled).toEqual([]);
  });
});

describe('getOrgEditorBoard', () => {
  it('returns one board per course the org has via course_orgs', async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ courseId: 11 }, { courseId: 22 }]),
    );
    const boardFor = (courseId: number) => ({
      course: {
        id: courseId,
        name: `Course ${courseId}`,
        slug: `c${courseId}`,
        description: null,
        imageUrlAvif: null,
        imageUrlWebp: null,
      },
      modules: [],
      remixes: [],
    });
    mockGetCourseBoard.mockImplementation(async (courseId: number) =>
      boardFor(courseId),
    );

    const boards = await getOrgEditorBoard(3);

    // Assert on what the consumer (getCourseBoard) actually received, not
    // just that *some* two boards came back — a mutant that called
    // getCourseBoard(11) twice (ignoring the second row) would still return
    // an array of length 2 with plausible-looking content.
    expect(mockGetCourseBoard.mock.calls).toEqual([[11], [22]]);
    expect(boards.map((b) => b.course.id)).toEqual([11, 22]);
  });

  it('drops a course whose board resolves to null rather than returning it', async () => {
    db.select.mockReturnValueOnce(makeChain([{ courseId: 11 }]));
    mockGetCourseBoard.mockResolvedValue(null);

    const boards = await getOrgEditorBoard(3);

    expect(boards).toEqual([]);
  });

  /**
   * This route hands EVERY course in the org to EVERY caller with standing on
   * the teaching side — a discipline SME staffing none of them included. A
   * bare Mux `videoRef` is directly streamable
   * (`https://stream.mux.com/{ref}.m3u8`) unless every asset is
   * signed-policy-only, an operator setting this code cannot verify, which is
   * why `api/course/details.ts` strips the same fields from the learner
   * payload. Nothing in the editor reads either field.
   *
   * Mutant seen RED: `toEditorCourseBoard` reduced to the identity function
   * (i.e. the pre-round-2 code, `boards.filter(...)` with no `.map`) — the
   * board still has the right courses, modules and lessons, and every other
   * assertion in this file still passes.
   */
  it('carries no video-identifying field for any lesson in any course', async () => {
    db.select.mockReturnValueOnce(makeChain([{ courseId: 11 }]));
    mockGetCourseBoard.mockResolvedValue({
      course: {
        id: 11,
        name: 'Two-Week',
        slug: 'two-week',
        description: null,
        imageUrlAvif: null,
        imageUrlWebp: null,
      },
      modules: [
        {
          id: 40,
          name: 'Fundamentals',
          slug: 'fundamentals',
          imageUrlAvif: null,
          imageUrlWebp: null,
          rank: 1,
          requiredSubscriptions: [],
          dependsOn: [],
          sequentialLessons: false,
          learnerCount: 0,
          owner: { id: 11, name: 'Two-Week' },
          otherCourseCount: 0,
          lessons: [
            {
              id: 9,
              name: 'Stalls',
              slug: 'stalls',
              rank: 1,
              isAvailable: true,
              hasDebrief: false,
              needsVideoWatch: false,
              requiredSubscriptions: [],
              levels: [],
              isConfigured: true,
              quizQuestionCount: 0,
              dependsOn: [],
              videoProvider: 'mux',
              videoRef: 'SECRET-PLAYBACK-ID',
            },
          ],
        },
      ],
      remixes: [],
    });

    const boards = await getOrgEditorBoard(3);

    const lesson = boards[0].modules[0].lessons[0] as Record<string, unknown>;
    expect(Object.hasOwn(lesson, 'videoRef')).toBe(false);
    expect(Object.hasOwn(lesson, 'videoProvider')).toBe(false);
    // Serialising is what actually reaches the browser, so assert there too:
    // a non-enumerable or prototype-shadowed field would pass the check above.
    expect(JSON.stringify(boards)).not.toContain('SECRET-PLAYBACK-ID');
    // And the editor still gets everything it DOES need.
    expect(lesson.name).toBe('Stalls');
    expect(lesson.rank).toBe(1);
    // `isConfigured` is how the card knows a lesson has a video at all — it
    // must survive, or the narrowing has taken something real with it.
    expect(lesson.isConfigured).toBe(true);
  });

  it('scopes the course_orgs lookup to this org, not every org', async () => {
    const whereCalls: SQL[] = [];
    db.select.mockReturnValueOnce(makeCapturingChain([], whereCalls));

    await getOrgEditorBoard(9);

    expect(whereCalls).toHaveLength(1);
    // Mutant this catches: `eq(courseOrgsTable.courseId, orgId)` — right
    // shape (a single equality on this table), wrong column — which would
    // otherwise let one org's editor board list courses through by
    // coincidence of id rather than actual org membership. Every other
    // test in this file stubs `where` with plain `makeChain`, which
    // discards the condition entirely, so none of them can catch this.
    expect(renderSql(whereCalls[0])).toBe('"course_orgs"."org_id" = $1');
    expect(renderSqlParams(whereCalls[0])).toEqual([9]);
  });
});
