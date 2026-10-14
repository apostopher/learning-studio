// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

// Real pgTable columns (not object stubs) so the WHERE `findFlagshipCourseId`
// builds can be rendered to exact SQL — see `render-sql.ts`.
const coursesTable = pgTable('courses', {
  id: integer('id').primaryKey(),
  slug: text('slug'),
});
const courseOrgsTable = pgTable('course_orgs', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  orgId: integer('org_id'),
});

const captured = vi.hoisted(() => ({
  where: [] as unknown[],
  result: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  select: vi.fn(() => {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const chain: any = {
      from: () => chain,
      innerJoin: () => chain,
      where: (w: unknown) => {
        captured.where.push(w);
        return chain;
      },
      limit: () => chain,
      // biome-ignore lint/suspicious/noThenProperty: awaitable like a drizzle query
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(captured.result).then(resolve),
    };
    return chain;
  }),
}));
const remixes = vi.hoisted(() => ({ remixCourse: vi.fn() }));

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ coursesTable, courseOrgsTable }));
vi.mock('#/db/course-remixes', () => remixes);

const {
  coursesNeedingFlagshipRemix,
  findFlagshipCourseId,
  remixFlagshipIntoNewCourse,
} = await import('#/db/flagship-remix');

beforeEach(() => {
  vi.clearAllMocks();
  captured.where = [];
  captured.result = [];
});

describe('coursesNeedingFlagshipRemix', () => {
  /**
   * The backfill's whole decision. Mutants: forgetting to skip the flagship
   * itself (remixCourse would refuse it as `self`, reported as a failure on
   * every run), or forgetting the existing links (not idempotent — every
   * re-run would report every course as `already-remixed` failures).
   */
  it('remixes every org course except the flagship and those already linked, in order', () => {
    expect(
      coursesNeedingFlagshipRemix({
        orgCourseIds: [2, 6, 3, 9, 4],
        flagshipId: 6,
        alreadyRemixedIds: [3, 4, 77],
      }),
    ).toEqual({ toRemix: [2, 9], alreadyRemixed: [3, 4] });
  });

  it('is a no-op once everything is linked — the second run remixes nothing', () => {
    expect(
      coursesNeedingFlagshipRemix({
        orgCourseIds: [2, 6],
        flagshipId: 6,
        alreadyRemixedIds: [2],
      }),
    ).toEqual({ toRemix: [], alreadyRemixed: [2] });
  });
});

describe('findFlagshipCourseId', () => {
  it('looks the flagship up by slug WITHIN the org', async () => {
    captured.result = [{ id: 6 }];
    await expect(findFlagshipCourseId(11)).resolves.toBe(6);
    const where = captured.where[0] as SQL;
    expect(renderSql(where)).toBe(
      '("courses"."slug" = $1 and "course_orgs"."org_id" = $2)',
    );
    expect(renderSqlParams(where)).toEqual(['3d-airmanship', 11]);
  });

  it('is null when the org has no flagship', async () => {
    captured.result = [];
    await expect(findFlagshipCourseId(11)).resolves.toBeNull();
  });
});

describe('remixFlagshipIntoNewCourse', () => {
  it('hands remixCourse the new course, the flagship and the org', async () => {
    captured.result = [{ id: 6 }];
    remixes.remixCourse.mockResolvedValue({ ok: true, moduleCount: 7 });

    await remixFlagshipIntoNewCourse(40, 11);

    expect(remixes.remixCourse).toHaveBeenCalledWith({
      orgId: 11,
      courseId: 40,
      sourceCourseId: 6,
      actorId: null,
    });
  });

  it('does nothing when the org has no flagship', async () => {
    captured.result = [];
    await remixFlagshipIntoNewCourse(40, 11);
    expect(remixes.remixCourse).not.toHaveBeenCalled();
  });

  it('does not remix the flagship into itself', async () => {
    captured.result = [{ id: 40 }];
    await remixFlagshipIntoNewCourse(40, 11);
    expect(remixes.remixCourse).not.toHaveBeenCalled();
  });

  /**
   * Course creation must survive a failed remix: the course is created and
   * linked to the org already, and an admin can still build it out. The
   * failure goes to the log, not to the caller.
   */
  it('logs, rather than throws, a refused remix', async () => {
    captured.result = [{ id: 6 }];
    remixes.remixCourse.mockResolvedValue({
      ok: false,
      reason: 'already-remixed',
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(remixFlagshipIntoNewCourse(40, 11)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('already-remixed');
    error.mockRestore();
  });

  it('names the offending modules when the flagship gates on a borrowed one', async () => {
    captured.result = [{ id: 6 }];
    remixes.remixCourse.mockResolvedValue({
      ok: false,
      reason: 'source-depends-on-borrowed',
      sourceName: '3D Airmanship',
      modules: [
        { slug: 'upset-recovery', name: 'Upset Recovery' },
        { slug: 'spins', name: 'Spins' },
      ],
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await remixFlagshipIntoNewCourse(40, 11);

    expect(String(error.mock.calls[0][0])).toContain('upset-recovery, spins');
    error.mockRestore();
  });

  it('logs, rather than throws, a remix that throws', async () => {
    captured.result = [{ id: 6 }];
    remixes.remixCourse.mockRejectedValue(new Error('deadlock'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(remixFlagshipIntoNewCourse(40, 11)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('logs, rather than throws, a failed flagship lookup', async () => {
    db.select.mockImplementationOnce(() => {
      throw new Error('connection reset');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(remixFlagshipIntoNewCourse(40, 11)).resolves.toBeUndefined();

    expect(remixes.remixCourse).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
