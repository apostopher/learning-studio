// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A queue-driven stand-in for drizzle: each awaited SELECT takes the next
 * queued result; each INSERT records the rows it was handed. The assertions
 * read those rows — what actually reached the database — not the function's
 * return value alone.
 */
const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    inserts: [] as unknown[],
  };
  function chain(isInsert: boolean) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    let values: unknown;
    for (const name of [
      'select',
      'from',
      'where',
      'orderBy',
      'values',
      'innerJoin',
      'limit',
    ]) {
      c[name] = (...args: unknown[]) => {
        if (name === 'values') values = args[0];
        return c;
      };
    }
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (resolve: (v: unknown) => unknown) => {
      if (isInsert) {
        state.inserts.push(values);
        return Promise.resolve([]).then(resolve);
      }
      return Promise.resolve(state.results.shift() ?? []).then(resolve);
    };
    return c;
  }
  const db = {
    select: () => chain(false),
    insert: () => chain(true),
    transaction: (fn: (tx: unknown) => unknown): unknown => fn(db),
  };
  return {
    state,
    db,
    createModule: vi.fn(),
    reorderModule: vi.fn(),
    getCourseIdsForLessons: vi.fn(),
    getCourseSlugsForModuleId: vi.fn(),
    lessonBelongsToCourseOrg: vi.fn(),
    invalidateCourseDetailsCache: vi.fn(),
  };
});
vi.mock('#/db', () => ({ db: fake.db }));
/**
 * Pins are `lesson-versions.test.ts`'s job, on Postgres. Here the write just
 * runs, and the assertions read which courses and lessons it was run for.
 */
const lessonVersions = vi.hoisted(() => ({
  lockModuleOwner: vi.fn(),
  getCourseIdsShowingModule: vi.fn(async (_tx: unknown, moduleId: number) => [
    5,
    moduleId,
  ]),
  getLessonIdsInModules: vi.fn(async () => [70, 71]),
  changeMembership: vi.fn(
    async (_tx: unknown, _scope: unknown, write: () => Promise<unknown>) => ({
      result: await write(),
      createdVersionIds: [501],
    }),
  ),
}));
vi.mock('#/db/lesson-versions', () => lessonVersions);
vi.mock('#/db/admin', () => ({
  createModule: fake.createModule,
  reorderModule: fake.reorderModule,
}));
vi.mock('#/db/placements', () => ({
  getCourseIdsForLessons: fake.getCourseIdsForLessons,
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugsForModuleId: fake.getCourseSlugsForModuleId,
  lessonBelongsToCourseOrg: fake.lessonBelongsToCourseOrg,
}));
vi.mock('#/db/course-cache', () => ({
  invalidateCourseDetailsCache: fake.invalidateCourseDetailsCache,
}));

import { copyDisciplineModuleIntoCourse } from '#/db/copy-discipline-module';

const COURSE = 5;
const NEW_MODULE = 900;

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.results = [];
  fake.state.inserts = [];
  fake.createModule.mockResolvedValue({
    id: NEW_MODULE,
    name: 'Basics',
    rank: 9,
  });
  fake.reorderModule.mockResolvedValue({ id: NEW_MODULE, rank: 2.5 });
  fake.getCourseIdsForLessons.mockResolvedValue(new Map());
  fake.getCourseSlugsForModuleId.mockResolvedValue(['two-week']);
});

describe('copyDisciplineModuleIntoCourse', () => {
  it('creates a same-named module and places its lessons in library order', async () => {
    fake.state.results = [
      [{ id: 7, name: 'Basics' }],
      // Out of order on purpose: 12 is ranked first, 11 is unranked (last).
      [
        { id: 11, name: 'Unranked', libraryRank: null },
        { id: 12, name: 'First', libraryRank: '1' },
        { id: 13, name: 'Second', libraryRank: '2' },
      ],
    ];

    const result = await copyDisciplineModuleIntoCourse({
      courseId: COURSE,
      disciplineModuleId: 7,
      afterModuleId: null,
    });

    expect(fake.createModule).toHaveBeenCalledWith({
      courseId: COURSE,
      name: 'Basics',
    });
    expect(fake.state.inserts).toEqual([
      [
        { moduleId: NEW_MODULE, lessonId: 12, rank: '1', dependsOn: [] },
        { moduleId: NEW_MODULE, lessonId: 13, rank: '2', dependsOn: [] },
        { moduleId: NEW_MODULE, lessonId: 11, rank: '3', dependsOn: [] },
      ],
    ]);
    // Every course showing the new module is told its lessons changed.
    expect(fake.invalidateCourseDetailsCache).toHaveBeenCalledWith('two-week');
    expect(result).toMatchObject({ skipped: [] });
    expect(result).toMatchObject({ createdVersionIds: [501] });
    expect(lessonVersions.lockModuleOwner).toHaveBeenCalledWith(
      fake.db,
      COURSE,
    );
    expect(lessonVersions.changeMembership).toHaveBeenCalledWith(
      fake.db,
      { courseIds: [COURSE, NEW_MODULE], lessonIds: [12, 13, 11] },
      expect.any(Function),
    );
    // Appended: no reorder without a module to sit after.
    expect(fake.reorderModule).not.toHaveBeenCalled();
  });

  it('skips lessons the course already teaches and names them', async () => {
    fake.state.results = [
      [{ id: 7, name: 'Basics' }],
      [
        { id: 12, name: 'Taught', libraryRank: '1' },
        { id: 13, name: 'New', libraryRank: '2' },
      ],
    ];
    fake.getCourseIdsForLessons.mockResolvedValue(new Map([[12, [3, COURSE]]]));

    const result = await copyDisciplineModuleIntoCourse({
      courseId: COURSE,
      disciplineModuleId: 7,
      afterModuleId: null,
    });

    expect(fake.state.inserts).toEqual([
      [{ moduleId: NEW_MODULE, lessonId: 13, rank: '1', dependsOn: [] }],
    ]);
    expect(result).toMatchObject({ skipped: [{ id: 12, name: 'Taught' }] });
    expect(result).toMatchObject({ placedLessonIds: [13] });
  });

  it('places the module after the one it was dropped on', async () => {
    fake.state.results = [
      [{ id: 7, name: 'Basics' }],
      [],
      // The module currently following the drop target.
      [{ moduleId: 41 }],
    ];

    const result = await copyDisciplineModuleIntoCourse({
      courseId: COURSE,
      disciplineModuleId: 7,
      afterModuleId: 40,
    });

    expect(fake.reorderModule).toHaveBeenCalledWith({
      courseId: COURSE,
      moduleId: NEW_MODULE,
      prevModuleId: 40,
      nextModuleId: 41,
    });
    expect(result).toMatchObject({ module: { rank: 2.5 } });
    // An empty library module creates an empty course module, nothing placed.
    expect(fake.state.inserts).toEqual([]);
  });

  it('keeps the append when the drop target is already last', async () => {
    fake.state.results = [[{ id: 7, name: 'Basics' }], [], []];

    await copyDisciplineModuleIntoCourse({
      courseId: COURSE,
      disciplineModuleId: 7,
      afterModuleId: 40,
    });

    expect(fake.reorderModule).not.toHaveBeenCalled();
  });

  it('creates nothing for a module outside the course’s orgs', async () => {
    fake.state.results = [[]];

    const result = await copyDisciplineModuleIntoCourse({
      courseId: COURSE,
      disciplineModuleId: 7,
      afterModuleId: null,
    });

    expect(result).toBeNull();
    expect(fake.createModule).not.toHaveBeenCalled();
    expect(fake.state.inserts).toEqual([]);
  });

  it('brings only the named lesson when one lesson creates its module', async () => {
    // The WHERE narrows to that lesson; the fake returns what the DB would.
    fake.state.results = [
      [{ id: 7, name: 'Basics' }],
      [{ id: 13, name: 'Second', libraryRank: '2' }],
    ];

    const result = await copyDisciplineModuleIntoCourse({
      courseId: COURSE,
      disciplineModuleId: 7,
      afterModuleId: null,
      onlyLessonId: 13,
    });

    expect(fake.createModule).toHaveBeenCalledWith({
      courseId: COURSE,
      name: 'Basics',
    });
    expect(fake.state.inserts).toEqual([
      [{ moduleId: NEW_MODULE, lessonId: 13, rank: '1', dependsOn: [] }],
    ]);
    expect(result).toMatchObject({ placedLessonIds: [13] });
  });

  it('names the module after a lesson that is in no library module', async () => {
    fake.lessonBelongsToCourseOrg.mockResolvedValue(true);
    fake.state.results = [[{ id: 14, name: 'eVTOL Intro', libraryRank: null }]];

    const result = await copyDisciplineModuleIntoCourse({
      courseId: COURSE,
      disciplineModuleId: null,
      afterModuleId: null,
      onlyLessonId: 14,
    });

    expect(fake.lessonBelongsToCourseOrg).toHaveBeenCalledWith(14, COURSE);
    expect(fake.createModule).toHaveBeenCalledWith({
      courseId: COURSE,
      name: 'eVTOL Intro',
    });
    expect(fake.state.inserts).toEqual([
      [{ moduleId: NEW_MODULE, lessonId: 14, rank: '1', dependsOn: [] }],
    ]);
    expect(result).toMatchObject({ placedLessonIds: [14] });
  });

  it('creates nothing for a lesson of another org', async () => {
    fake.lessonBelongsToCourseOrg.mockResolvedValue(false);
    fake.state.results = [[{ id: 14, name: 'eVTOL Intro', libraryRank: null }]];

    expect(
      await copyDisciplineModuleIntoCourse({
        courseId: COURSE,
        disciplineModuleId: null,
        afterModuleId: null,
        onlyLessonId: 14,
      }),
    ).toBeNull();
    expect(fake.createModule).not.toHaveBeenCalled();
  });

  it('creates no empty module for a lesson the course already teaches', async () => {
    fake.state.results = [
      [{ id: 7, name: 'Basics' }],
      [{ id: 13, name: 'Second', libraryRank: '2' }],
    ];
    fake.getCourseIdsForLessons.mockResolvedValue(new Map([[13, [COURSE]]]));

    expect(
      await copyDisciplineModuleIntoCourse({
        courseId: COURSE,
        disciplineModuleId: 7,
        afterModuleId: null,
        onlyLessonId: 13,
      }),
    ).toBe('duplicate');
    expect(fake.createModule).not.toHaveBeenCalled();
  });

  it('creates nothing when the named lesson is not in that module', async () => {
    fake.state.results = [[{ id: 7, name: 'Basics' }], []];

    const result = await copyDisciplineModuleIntoCourse({
      courseId: COURSE,
      disciplineModuleId: 7,
      afterModuleId: null,
      onlyLessonId: 99,
    });

    expect(result).toBeNull();
    expect(fake.createModule).not.toHaveBeenCalled();
  });
});
