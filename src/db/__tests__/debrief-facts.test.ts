// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

/**
 * `getDebriefFacts` is the route-side twin of the progress SQL in
 * `progress-components.ts` (`debriefPassed`, `lastFailedDebriefAt`, `doneAt`).
 * The two must agree for the same rows, or the lesson list would show a red D
 * the generate route refuses to open (or the reverse).
 */

const m = vi.hoisted(() => ({
  queue: [] as unknown[][],
  wheres: [] as unknown[],
}));

function chain(result: unknown) {
  const p = Promise.resolve(result) as Promise<unknown> &
    Record<string, (...a: unknown[]) => unknown>;
  Object.assign(p, {
    from: () => p,
    where: (cond: unknown) => {
      m.wheres.push(cond);
      return p;
    },
    orderBy: () => p,
    limit: () => p,
  });
  return p;
}

vi.mock('#/db', () => ({
  db: { select: () => chain(m.queue.shift() ?? []) },
}));

import { getDebriefAttempts, getDebriefFacts } from '#/db/lesson-test';

const at = (iso: string) => new Date(iso);

beforeEach(() => {
  m.queue.length = 0;
  m.wheres.length = 0;
});

describe('getDebriefAttempts', () => {
  it('reads only COMPLETED, scored attempts for this user and lesson', async () => {
    m.queue.push([]);
    await getDebriefAttempts('u1', 'l1');
    const where = m.wheres[0] as SQL;
    expect(renderSql(where)).toBe(
      '("lesson_test_results"."user_id" = $1 and "lesson_test_results"."lesson_slug" = $2 and "lesson_test_results"."completed_at" is not null and "lesson_test_results"."total_score" is not null)',
    );
    expect(renderSqlParams(where)).toEqual(['u1', 'l1']);
  });

  it('returns completedAt as a true UTC instant', async () => {
    // drizzle maps a `timestamp` (no tz) column by appending +0000, so the
    // Date it hands back is already the UTC wall time the row was written at.
    m.queue.push([
      { id: 2, totalScore: 60, completedAt: at('2026-10-27T09:30:00.000Z') },
    ]);
    expect(await getDebriefAttempts('u1', 'l1')).toEqual([
      { id: 2, totalScore: 60, completedAt: '2026-10-27T09:30:00.000Z' },
    ]);
  });
});

describe('getDebriefFacts mirrors the progress SQL', () => {
  const facts = async (
    attempts: { id: number; totalScore: number; completedAt: Date }[],
    doneAt: Date | null,
  ) => {
    m.queue.push(attempts, doneAt ? [{ doneAt }] : []);
    return getDebriefFacts('u1', 'l1', 41);
  };

  it('reads doneAt from lesson_completions by user and lesson id', async () => {
    await facts([], at('2026-10-25T00:00:00.000Z'));
    const where = m.wheres[1] as SQL;
    expect(renderSql(where)).toBe(
      '("lesson_completions"."user_id" = $1 and "lesson_completions"."lesson_id" = $2)',
    );
    expect(renderSqlParams(where)).toEqual(['u1', 41]);
  });

  it('nothing recorded → not done, not passed, never failed', async () => {
    expect(await facts([], null)).toEqual({
      doneAt: null,
      passed: false,
      lastFailedAt: null,
    });
  });

  it('doneAt is the ISO of the sticky completion', async () => {
    expect((await facts([], at('2026-10-25T00:00:00.000Z'))).doneAt).toBe(
      '2026-10-25T00:00:00.000Z',
    );
  });

  it('passed = any attempt at or above par (70)', async () => {
    expect(
      (
        await facts(
          [{ id: 1, totalScore: 70, completedAt: at('2026-10-26T00:00:00Z') }],
          null,
        )
      ).passed,
    ).toBe(true);
    expect(
      (
        await facts(
          [{ id: 1, totalScore: 69, completedAt: at('2026-10-26T00:00:00Z') }],
          null,
        )
      ).passed,
    ).toBe(false);
  });

  it('lastFailedAt = the LATEST below-par completion, whatever the row order', async () => {
    const f = await facts(
      [
        { id: 1, totalScore: 40, completedAt: at('2026-10-20T00:00:00.000Z') },
        { id: 3, totalScore: 65, completedAt: at('2026-10-26T08:00:00.000Z') },
        { id: 2, totalScore: 90, completedAt: at('2026-10-27T00:00:00.000Z') },
      ],
      at('2026-10-19T00:00:00.000Z'),
    );
    // Reported independently of `passed`, exactly as the SQL selects both.
    expect(f).toEqual({
      doneAt: '2026-10-19T00:00:00.000Z',
      passed: true,
      lastFailedAt: '2026-10-26T08:00:00.000Z',
    });
  });
});
