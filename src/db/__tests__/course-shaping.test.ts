import { describe, expect, it, vi } from 'vitest';

// `src/db/course.ts` imports `@/db/schema`, `#/db` (which relatively imports
// the real schema.ts), and `@/integrations/upstash/redis` at module scope.
// The `@/` alias never resolves under Vitest in this project (only `#/`
// does — see tsconfig.json / vite.config.ts), and `@/integrations/upstash/redis`
// calls `Redis.fromEnv()` at import time, which throws without live Upstash
// env vars. `shapeModuleLessons` never touches any of these, so they're
// stubbed here purely to let the module load; this does not change what the
// production code imports.
vi.mock('#/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({
  coursesTable: {},
  modulesTable: {},
  lessonsTable: {},
  lessonDependenciesTable: {},
  moduleDependenciesTable: {},
  orgLessonsTable: {},
  orgsTable: {},
  courseSubscriptionsTable: {},
  videoProgressTable: {},
}));
vi.mock('@/integrations/upstash/redis', () => ({
  cacheWithRedis: (_keyPrefix: string, fn: unknown) => fn,
}));

import { shapeModuleLessons } from '#/db/course';

const lesson = (id: number, rank: string, isAvailable = true) => ({
  id,
  rank,
  isAvailable,
  dependsOn: [] as { lessonSlug: string; moduleSlug: string }[],
});

describe('shapeModuleLessons', () => {
  it('drops unavailable lessons', () => {
    const mod = {
      lessons: [lesson(1, '1'), lesson(2, '2', false), lesson(3, '3')],
    };
    shapeModuleLessons([mod]);
    expect(mod.lessons.map((l) => l.id)).toEqual([1, 3]);
  });

  it('sorts the remaining lessons by numeric rank', () => {
    const mod = {
      lessons: [lesson(1, '30'), lesson(2, '4'), lesson(3, '100')],
    };
    shapeModuleLessons([mod]);
    // String comparison would give 100, 30, 4 — rank is numeric(30,15).
    expect(mod.lessons.map((l) => l.id)).toEqual([2, 1, 3]);
  });

  it('adds no dependencies of its own', () => {
    const mod = { lessons: [lesson(1, '1'), lesson(2, '2'), lesson(3, '3')] };
    shapeModuleLessons([mod]);
    // The deleted block chained every lesson to its predecessor for module ids
    // 2..5, which after the ITPS import meant 36 lessons became sequential by
    // accident of primary key.
    expect(mod.lessons.every((l) => l.dependsOn.length === 0)).toBe(true);
  });
});
