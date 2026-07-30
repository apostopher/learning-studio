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
} = vi.hoisted(() => ({
  getUserRoleNames: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  isSubscribedToCourseSlug: vi.fn(),
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
  modulesTable: {},
}));
vi.mock('#/db/course', () => ({ getCourseDetailsWithCache }));
vi.mock('#/db/course-progress', () => ({ getCourseProgress }));
vi.mock('#/db/admin', () => ({ getUserRoleNames }));
vi.mock('#/db/lesson-access', () => ({ isSubscribedToCourseSlug }));

import {
  filterGatedLessons,
  getCourseContentForAgent,
} from '#/db/course-content';

const row = (lessonSlug: string, text: string, lessonId = 1) => ({
  lessonId,
  lessonSlug,
  lessonName: lessonSlug,
  moduleId: 1,
  moduleName: 'M',
  courseName: 'C',
  text,
  proTips: 'tips',
});

const course = {
  modules: [
    {
      slug: 'm1',
      name: 'M',
      dependsOn: [],
      lessons: [
        {
          slug: 'a',
          name: 'A',
          isAvailable: true,
          videoId: 'v',
          needsVideoWatch: true,
          dependsOn: [],
        },
        {
          slug: 'b',
          name: 'B',
          isAvailable: true,
          videoId: 'v2',
          needsVideoWatch: true,
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

  it('keeps everything when no user context is available', () => {
    const kept = filterGatedLessons([row('a', 'A body')], course, null, false);
    expect(kept).toHaveLength(1);
  });
});

const detailsFor = (
  lessons: {
    id: number;
    slug: string;
    name: string;
    isAvailable: boolean;
    videoId: string | null;
    needsVideoWatch: boolean;
    dependsOn: readonly { lessonSlug: string; moduleSlug?: string }[];
  }[],
) => ({
  modules: [{ id: 1, slug: 'm1', name: 'M', dependsOn: [], lessons }],
});

describe('getCourseContentForAgent subscription gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [];
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
          videoId: null,
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
          videoId: null,
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
          videoId: 'v',
          needsVideoWatch: true,
          dependsOn: [],
        },
        {
          id: 11,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          videoId: null,
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
