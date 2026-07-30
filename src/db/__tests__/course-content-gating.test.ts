import { describe, expect, it, vi } from 'vitest';

// course-content.ts imports the real `#/db` client, `#/db/schema` (which has
// a runtime `@/types` value import that vitest cannot resolve — see memory:
// vitest can't resolve @/, use #/), plus `#/db/course`, `#/db/course-progress`,
// and `#/db/admin` for the gated userId branch of `getCourseContentForAgent`.
// `filterGatedLessons` itself never touches any of them, so — following the
// repo's established pattern (fully stub, never importOriginal an internal
// module with `@/` value imports; see src/lib/__tests__/lesson-gating-server.test.ts) —
// they're stubbed here purely to let the module load under vitest.
vi.mock('#/db', () => ({ db: {} }));
vi.mock('#/db/schema', () => ({
  coursesTable: {},
  lessonMaterialTable: {},
  lessonsTable: {},
  modulesTable: {},
}));
vi.mock('#/db/course', () => ({ getCourseDetailsWithCache: vi.fn() }));
vi.mock('#/db/course-progress', () => ({ getCourseProgress: vi.fn() }));
vi.mock('#/db/admin', () => ({ getUserRoleNames: vi.fn() }));

import { filterGatedLessons } from '#/db/course-content';

const row = (lessonSlug: string, text: string) => ({
  lessonId: 1,
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
