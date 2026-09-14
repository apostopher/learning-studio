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
vi.mock('#/db/course-remixes', () => ({
  getRemixerCourseIds: vi.fn(),
  countRemixers: vi.fn(),
}));
vi.mock('#/db/course-modules', () => ({
  courseModuleIds: vi.fn(() => 'SUBQUERY'),
}));
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(),
  getCourseSlugForCourseId: vi.fn(),
  getCourseSlugForModuleId: vi.fn(),
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

const { listAdminCourses } = await import('../admin');
const { courseModulesTable, modulesTable } = await import('../schema');

beforeEach(() => {
  for (const list of Object.values(cap.captured)) list.length = 0;
});

describe('listAdminCourses counts', () => {
  /**
   * Mutant this catches: counting OWNED modules (`modules.course_id`). A
   * remixer with three own modules and seven borrowed would show "3
   * modules" in the courses list and 10 on its rail.
   */
  it('joins modules through course_modules, so borrowed modules count', async () => {
    await listAdminCourses();
    expect(cap.captured.joins[0]).toBe(courseModulesTable);
    expect(renderSql(cap.captured.joinOn[0] as SQL)).toBe(
      '"course_modules"."course_id" = "courses"."id"',
    );
    expect(cap.captured.joins[1]).toBe(modulesTable);
    expect(renderSql(cap.captured.joinOn[1] as SQL)).toBe(
      '"modules"."id" = "course_modules"."module_id"',
    );
  });
});
