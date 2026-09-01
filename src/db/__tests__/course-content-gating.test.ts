import { beforeEach, describe, expect, it, vi } from 'vitest';

// course-content.ts imports the real `#/db` client, `#/db/schema` (which has
// a runtime `@/types` value import that vitest cannot resolve — see memory:
// vitest can't resolve @/, use #/), plus `#/db/course`, `#/db/course-progress`,
// `#/db/admin`, and `#/db/lesson-access` for the gated userId branch of
// `getCourseContentForAgent`. `filterGatedLessons` itself never touches any
// of them, so — following the repo's established pattern (fully stub, never
// importOriginal an internal module with `@/` value imports; see
// src/lib/__tests__/lesson-gating-server.test.ts) — they're stubbed here
// purely to let the module load under vitest.
//
// `dbState.rows` backs a minimal chainable `db.select().from()...orderBy()`
// stub so `getCourseContentForAgent`'s subscription-gate tests can exercise
// the real function end to end (not just `filterGatedLessons` in isolation)
// — the mock ignores every argument and simply resolves `orderBy()` with
// whatever rows the current test set.
const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));
const {
  getUserRoleNames,
  getCourseDetailsWithCache,
  getCourseProgress,
  isSubscribedToCourseSlug,
  getCurrentLevel,
  isCourseStaff,
} = vi.hoisted(() => ({
  getUserRoleNames: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  isSubscribedToCourseSlug: vi.fn(),
  getCurrentLevel: vi.fn(),
  isCourseStaff: vi.fn(),
}));

vi.mock('#/db', () => {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(dbState.rows),
  };
  return { db: { select: () => chain } };
});
vi.mock('#/db/schema', () => ({
  coursesTable: {},
  lessonMaterialTable: {},
  lessonsTable: {},
  moduleLessonsTable: {},
  modulesTable: {},
}));
vi.mock('#/db/course', () => ({ getCourseDetailsWithCache }));
vi.mock('#/db/course-progress', () => ({ getCourseProgress }));
vi.mock('#/db/admin', () => ({ getUserRoleNames }));
vi.mock('#/db/lesson-access', () => ({ isSubscribedToCourseSlug }));
// The course-staff bypass runs for every non-admin, and the real module
// would reach for the `db` stub above with a chain it does not implement.
vi.mock('#/db/course-staff', () => ({ isCourseStaff }));
vi.mock('#/db/user-levels', () => ({ getCurrentLevel }));

import {
  filterGatedLessons,
  getCourseContentForAgent,
} from '#/db/course-content';

const row = (
  lessonSlug: string,
  text: string,
  lessonId = 1,
  isAvailable = true,
) => ({
  lessonId,
  lessonSlug,
  lessonName: lessonSlug,
  moduleId: 1,
  moduleName: 'M',
  // The real SELECT carries the course id so the pilot's level can be
  // resolved without a second lookup; the level assertions below read it.
  courseId: 7,
  courseName: 'C',
  isAvailable,
  text,
  proTips: 'tips',
});

const course = {
  modules: [
    {
      slug: 'm1',
      name: 'M',
      dependsOn: [],
      sequentialLessons: false,
      lessons: [
        {
          slug: 'a',
          name: 'A',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          levels: [],
          dependsOn: [],
        },
        {
          slug: 'b',
          name: 'B',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          levels: [],
          dependsOn: [],
        },
      ],
    },
  ],
};

describe('filterGatedLessons', () => {
  it('drops rows for lessons the user has not unlocked', () => {
    const kept = filterGatedLessons(
      [row('a', 'A body'), row('b', 'B body')],
      course,
      new Set(['a']),
      false,
    );
    // A student locked out of B must not be able to ask the chat for it.
    expect(kept.map((r) => r.lessonSlug)).toEqual(['a']);
  });

  it('keeps everything for an admin', () => {
    const kept = filterGatedLessons(
      [row('a', 'A body'), row('b', 'B body')],
      course,
      new Set(),
      true,
    );
    expect(kept).toHaveLength(2);
  });
});

const detailsFor = (
  lessons: {
    id: number;
    slug: string;
    name: string;
    isAvailable: boolean;
    hasVideo: boolean;
    needsVideoWatch: boolean;
    dependsOn: readonly { lessonSlug: string; moduleSlug?: string }[];
    /** Defaults to [] — visible at every tier — so the fixtures above keep
     * describing the subscription and material gates and nothing else. */
    levels?: readonly string[];
  }[],
) => ({
  // Chain off: these fixtures state their prerequisites explicitly and are
  // about the subscription and material gates. Leaving it on (the column
  // default) would add a prerequisite none of the assertions describe.
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'M',
      dependsOn: [],
      sequentialLessons: false,
      lessons: lessons.map((lesson) => ({ levels: [], ...lesson })),
    },
  ],
});

describe('getCourseContentForAgent subscription gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [];
    getCurrentLevel.mockResolvedValue('basic');
    isCourseStaff.mockResolvedValue(false);
  });

  // The exact bypass the reviewer traced: a lesson with no unmet
  // module/lesson prerequisites and no video requirement passes both
  // `evaluateLessonLock`/`evaluateMaterialLock` for ANY watched-set, including
  // the all-empty one a non-enrolled user gets back from `getCourseProgress`
  // (it left-joins by userId and never errors for a stranger to the course).
  // Only the subscription check stops this — proven here by asserting
  // `getCourseDetailsWithCache` (which feeds the lock check) is never even
  // reached.
  it('returns no content for an authenticated non-subscriber, even for a lesson whose locks are open', async () => {
    dbState.rows = [row('b', 'B body')];
    getUserRoleNames.mockResolvedValue([]);
    isSubscribedToCourseSlug.mockResolvedValue(false);
    // Configured even though the fixed code should never reach them (asserted
    // below via `not.toHaveBeenCalled`) — with the subscription check
    // removed, this is exactly what lets the unfixed code sail through: the
    // lock predicates alone see an open lesson (no video requirement, no
    // unmet prerequisites) and happily hand its material back.
    getCourseDetailsWithCache.mockResolvedValue(
      detailsFor([
        {
          id: 10,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          hasVideo: false,
          needsVideoWatch: false,
          dependsOn: [],
        },
      ]),
    );
    getCourseProgress.mockResolvedValue({ lessons: [] });

    const html = await getCourseContentForAgent('course-b', { userId: 'u1' });

    expect(html).toBe('');
    expect(getCourseDetailsWithCache).not.toHaveBeenCalled();
  });

  it('gives an admin non-subscriber everything, same as any other admin path', async () => {
    dbState.rows = [row('b', 'B body')];
    getUserRoleNames.mockResolvedValue(['admin']);
    isSubscribedToCourseSlug.mockResolvedValue(false);
    getCourseDetailsWithCache.mockResolvedValue(
      detailsFor([
        {
          id: 10,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          hasVideo: false,
          needsVideoWatch: false,
          dependsOn: [],
        },
      ]),
    );
    getCourseProgress.mockResolvedValue({ lessons: [] });

    const html = await getCourseContentForAgent('course-b', {
      userId: 'admin-1',
    });

    expect(html).toContain('B body');
  });

  it('gives an unenrolled subject expert their own course, and nothing elsewhere', async () => {
    dbState.rows = [row('b', 'B body')];
    getUserRoleNames.mockResolvedValue([]);
    isSubscribedToCourseSlug.mockResolvedValue(false);
    getCourseDetailsWithCache.mockResolvedValue(
      detailsFor([
        {
          id: 10,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          hasVideo: false,
          needsVideoWatch: false,
          dependsOn: [],
        },
      ]),
    );
    getCourseProgress.mockResolvedValue({ lessons: [] });
    // The rows carry courseId 7; this grant is on 99.
    isCourseStaff.mockImplementation(
      async (_userId: string, courseId: number) => courseId === 99,
    );

    expect(
      await getCourseContentForAgent('course-b', { userId: 'sme-1' }),
    ).toBe('');
    expect(getCourseDetailsWithCache).not.toHaveBeenCalled();

    isCourseStaff.mockResolvedValue(true);
    expect(
      await getCourseContentForAgent('course-b', { userId: 'sme-1' }),
    ).toContain('B body');
  });

  // The gate predicate answers "unknown lesson -> open" by contract, and
  // `getCourseDetailsWithCache` no longer carries `is_available = false`
  // lessons at all (shapeModuleLessons strips them), so every WIP lesson is
  // invisible to `evaluateLessonLock`/`evaluateMaterialLock` and sails through
  // both. This function's own SELECT has to exclude them, or all 23 draft
  // lessons' text/proTips land in the model's context. Fixtured with the WIP
  // lesson ABSENT from the details payload, because that is exactly what the
  // real cached payload looks like.
  it('drops a WIP (is_available = false) lesson even though its gates read as open', async () => {
    dbState.rows = [
      row('a', 'A body', 10, true),
      row('wip', 'WIP body', 11, false),
    ];
    getUserRoleNames.mockResolvedValue([]);
    isSubscribedToCourseSlug.mockResolvedValue(true);
    getCourseDetailsWithCache.mockResolvedValue(
      detailsFor([
        {
          id: 10,
          slug: 'a',
          name: 'A',
          isAvailable: true,
          hasVideo: false,
          needsVideoWatch: false,
          dependsOn: [],
        },
      ]),
    );
    getCourseProgress.mockResolvedValue({ lessons: [] });

    const html = await getCourseContentForAgent('course-b', { userId: 'u1' });

    expect(html).toContain('A body');
    expect(html).not.toContain('WIP body');
  });

  it('withholds WIP lessons from an admin too — the agent corpus is the learner corpus', async () => {
    // Decision #28 keeps WIP lessons visible in the admin *editor*, which
    // reads getCourseBoard. The chat is not the editor, and
    // getCourseDetailsWithCache already hides them from admins as well, so
    // the corpus stays one thing for everybody.
    dbState.rows = [
      row('a', 'A body', 10, true),
      row('wip', 'WIP body', 11, false),
    ];
    getUserRoleNames.mockResolvedValue(['admin']);
    isSubscribedToCourseSlug.mockResolvedValue(false);
    getCourseDetailsWithCache.mockResolvedValue(detailsFor([]));
    getCourseProgress.mockResolvedValue({ lessons: [] });

    const html = await getCourseContentForAgent('course-b', {
      userId: 'admin-1',
    });

    expect(html).toContain('A body');
    expect(html).not.toContain('WIP body');
  });

  it('leaves a real subscriber unaffected, still applying the per-lesson locks', async () => {
    dbState.rows = [row('a', 'A body', 10), row('b', 'B body', 11)];
    getUserRoleNames.mockResolvedValue([]);
    isSubscribedToCourseSlug.mockResolvedValue(true);
    getCourseDetailsWithCache.mockResolvedValue(
      detailsFor([
        {
          id: 10,
          slug: 'a',
          name: 'A',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          dependsOn: [],
        },
        {
          id: 11,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          hasVideo: false,
          needsVideoWatch: false,
          dependsOn: [],
        },
      ]),
    );
    getCourseProgress.mockResolvedValue({ lessons: [] });

    const html = await getCourseContentForAgent('course-b', { userId: 'u2' });

    expect(html).toContain('B body');
    expect(html).not.toContain('A body');
  });
});

/**
 * Level visibility in the agent corpus.
 *
 * The chat widget is mounted app-wide, and its course content is assembled
 * from lesson_material — the same text `/api/lesson/material` refuses for an
 * out-of-tier lesson. Without this filter a pilot who is refused a lesson can
 * simply ask the assistant to read it out, which is the exact failure the
 * gating in this file exists to prevent, reached through a different door.
 *
 * These assert on the assembled HTML because that string IS what the consumer
 * receives: `makeSearchKBTool` passes it straight into the model's context.
 */
describe('getCourseContentForAgent level visibility', () => {
  const twoTiers = () =>
    detailsFor([
      {
        id: 10,
        slug: 'a',
        name: 'A',
        isAvailable: true,
        hasVideo: false,
        needsVideoWatch: false,
        dependsOn: [],
        levels: ['basic'],
      },
      {
        id: 11,
        slug: 'b',
        name: 'B',
        isAvailable: true,
        hasVideo: false,
        needsVideoWatch: false,
        dependsOn: [],
        levels: ['intermediate'],
      },
    ]);

  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [row('a', 'A body', 10), row('b', 'B body', 11)];
    getUserRoleNames.mockResolvedValue([]);
    isSubscribedToCourseSlug.mockResolvedValue(true);
    getCourseDetailsWithCache.mockResolvedValue(twoTiers());
    getCourseProgress.mockResolvedValue({ lessons: [] });
    getCurrentLevel.mockResolvedValue('intermediate');
    isCourseStaff.mockResolvedValue(false);
  });

  it('withholds an out-of-tier lesson whose locks are wide open', async () => {
    // Both lessons have no video and no prerequisites, so both pass
    // evaluateLessonLock/evaluateMaterialLock for any watched-set. The level
    // filter is the only thing standing between the pilot and A's text.
    const html = await getCourseContentForAgent('c1', { userId: 'u1' });
    expect(html).toContain('B body');
    expect(html).not.toContain('A body');
  });

  it('resolves the level for the course the content belongs to', async () => {
    // The mock is only load-bearing if it actually replaced the module.
    await getCourseContentForAgent('c1', { userId: 'u1' });
    expect(getCurrentLevel).toHaveBeenCalledWith('u1', 7);
  });

  it('keeps untagged lessons, which belong to every tier', async () => {
    getCourseDetailsWithCache.mockResolvedValue(
      detailsFor([
        {
          id: 10,
          slug: 'a',
          name: 'A',
          isAvailable: true,
          hasVideo: false,
          needsVideoWatch: false,
          dependsOn: [],
        },
      ]),
    );
    dbState.rows = [row('a', 'A body', 10)];
    const html = await getCourseContentForAgent('c1', { userId: 'u1' });
    expect(html).toContain('A body');
  });

  it('drops a lesson the cached payload does not contain at all', async () => {
    // Fail closed, matching evaluateLessonGate: an unknown lesson cannot be
    // level-checked, and the lock predicates answer "open" for lessons they
    // cannot locate — so waving it through would make the unknown case the
    // most permissive one.
    dbState.rows = [row('ghost', 'Ghost body', 99)];
    const html = await getCourseContentForAgent('c1', { userId: 'u1' });
    expect(html).not.toContain('Ghost body');
  });

  it('does not resolve a level for an admin, who authors every tier', async () => {
    getUserRoleNames.mockResolvedValue(['admin']);
    const html = await getCourseContentForAgent('c1', { userId: 'admin-1' });
    expect(html).toContain('A body');
    expect(html).toContain('B body');
    expect(getCurrentLevel).not.toHaveBeenCalled();
  });

  it('does not resolve a level for a subject expert on their own course', async () => {
    isCourseStaff.mockResolvedValue(true);
    const html = await getCourseContentForAgent('c1', { userId: 'sme-1' });
    expect(html).toContain('A body');
    expect(html).toContain('B body');
    expect(getCurrentLevel).not.toHaveBeenCalled();
    // The course id comes from the row the query returned, so the grant is
    // tested against the course whose content is being assembled.
    expect(isCourseStaff).toHaveBeenCalledWith('sme-1', 7);
  });

  it('still filters by tier for a subject expert who staffs another course', async () => {
    // Staff on course 99, reading course 7: an ordinary intermediate learner
    // here, so the basic-tier lesson stays withheld.
    isCourseStaff.mockImplementation(
      async (_userId: string, courseId: number) => courseId === 99,
    );
    const html = await getCourseContentForAgent('c1', { userId: 'sme-1' });
    expect(html).toContain('B body');
    expect(html).not.toContain('A body');
  });

  it('does not query staff for an admin — they bypass on role alone', async () => {
    getUserRoleNames.mockResolvedValue(['admin']);
    await getCourseContentForAgent('c1', { userId: 'admin-1' });
    expect(isCourseStaff).not.toHaveBeenCalled();
  });
});
