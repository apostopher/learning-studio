// src/db/__tests__/course-board-provenance.test.ts
// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql } from '#/db/__tests__/render-sql';
import type { Captured } from './support/capture-db';

const cap = vi.hoisted(() => {
  const captured = {
    select: [] as unknown[],
    from: [] as unknown[],
    joins: [] as unknown[],
    joinOn: [] as unknown[],
    where: [] as unknown[],
    orderBy: [] as unknown[],
    groupBy: [] as unknown[],
  } satisfies Captured;
  return { captured, results: [] as unknown[][] };
});
vi.mock('#/db', async () => {
  const { captureDb } = await import('./support/capture-db');
  const { db, captured, results } = captureDb();
  Object.assign(cap.captured, captured);
  cap.results = results;
  return { db };
});
const remixes = vi.hoisted(() => ({
  getRemixSourceIds: vi.fn(async () => [] as number[]),
  countRemixers: vi.fn(),
}));
vi.mock('#/db/course-remixes', () => remixes);
vi.mock('#/db/course-modules', () => ({
  courseModuleIds: vi.fn(() => 'SUBQUERY'),
}));
vi.mock('#/db/placements', () => ({
  getPlacementsForCourse: vi.fn(async () => []),
  movePlacement: vi.fn(),
}));
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(),
  getCourseSlugForCourseId: vi.fn(),
  getCourseSlugsForModuleId: vi.fn(),
  getCourseSlugsForLessonId: vi.fn(),
  lessonBelongsToCourseOrg: vi.fn(),
}));
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

const { getCourseBoard } = await import('../admin');

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of Object.values(cap.captured)) list.length = 0;
  cap.results.length = 0;
});

const MODULE_ROW = {
  id: 10,
  name: 'Borrowed',
  slug: 'borrowed',
  imageUrlAvif: null,
  imageUrlWebp: null,
  rank: '4',
  requiredSubscriptions: [],
  sequentialLessons: true,
  ownerId: 6,
  ownerName: '3D Airmanship',
};

describe('getCourseBoard provenance', () => {
  it('names each module’s OWNER from modules.course_id, joined to courses', async () => {
    cap.results.push([{ id: 2, name: 'ITPS', slug: 'itps' }]);
    cap.results.push([MODULE_ROW]);
    cap.results.push([{ moduleId: 10, n: 2 }]); // placement counts
    remixes.getRemixSourceIds.mockResolvedValue([6]);

    const board = await getCourseBoard(2);

    expect(board?.modules[0].owner).toEqual({ id: 6, name: '3D Airmanship' });
    // The owner join pairs the aliased courses table with the OWNER column.
    const ownerJoin = cap.captured.joinOn.map((j) => renderSql(j as SQL));
    expect(ownerJoin).toContain('"owner_course"."id" = "modules"."course_id"');
  });

  it('reports how many OTHER courses show the module', async () => {
    cap.results.push([{ id: 2, name: 'ITPS', slug: 'itps' }]);
    cap.results.push([MODULE_ROW]);
    cap.results.push([{ moduleId: 10, n: 2 }]);
    const board = await getCourseBoard(2);
    expect(board?.modules[0].otherCourseCount).toBe(1);
  });

  it('carries the remix links so the editor knows what is already remixed', async () => {
    cap.results.push([{ id: 2, name: 'ITPS', slug: 'itps' }]);
    cap.results.push([]);
    remixes.getRemixSourceIds.mockResolvedValue([6]);
    const board = await getCourseBoard(2);
    expect(board?.remixes).toEqual([{ sourceCourseId: 6 }]);
    expect(remixes.getRemixSourceIds).toHaveBeenCalledWith(2);
  });
});
