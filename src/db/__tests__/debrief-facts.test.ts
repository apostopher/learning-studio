// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

/**
 * `getDebriefFacts` is the route-side twin of the progress SQL in
 * `progress-components.ts`. The two must agree for the same rows, or the
 * lesson list would show a D the start route refuses to open (or the reverse).
 */

const m = vi.hoisted(() => ({
  queue: [] as unknown[][],
  wheres: [] as unknown[],
  selects: [] as Record<string, unknown>[],
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
  db: {
    select: (fields: Record<string, unknown>) => {
      m.selects.push(fields);
      return chain(m.queue.shift() ?? []);
    },
  },
}));

import {
  getDebriefAttemptReports,
  getDebriefAttempts,
  getDebriefFacts,
  getTestResults,
} from '#/db/lesson-test';
import {
  debriefFactColumns,
  videoWatchedAtSql,
} from '#/db/progress-components';
import { lessonsTable } from '#/db/schema';

const at = (iso: string) => new Date(iso);

beforeEach(() => {
  m.queue.length = 0;
  m.wheres.length = 0;
  m.selects.length = 0;
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

describe('getDebriefFacts', () => {
  type Opts = {
    lastFinishedAt?: string | null;
    hasOpen?: boolean;
    passed?: boolean;
    doneAt?: Date | null;
    // Raw `sql<Date>` columns arrive from the driver as offset-bearing strings.
    videoWatchedAt?: string | null;
    hasVideo?: boolean;
    chunksCleared?: number;
    chunksTotal?: number | null;
  };
  const facts = async ({
    lastFinishedAt = null,
    hasOpen = false,
    passed = false,
    doneAt = null,
    videoWatchedAt = null,
    hasVideo = videoWatchedAt !== null,
    chunksCleared = 0,
    chunksTotal = null,
  }: Opts = {}) => {
    m.queue.push(doneAt ? [{ doneAt }] : [], [
      {
        debriefPassed: passed,
        lastFinishedDebriefAt: lastFinishedAt,
        hasOpenDebrief: hasOpen,
        chunksCleared,
        chunksTotal,
        videoWatchedAt,
        videoProvider: hasVideo ? 'mux' : null,
        videoRef: hasVideo ? 'ref' : null,
      },
    ]);
    return getDebriefFacts('u1', 'l1', 41);
  };

  it('nothing recorded → no clock, not passed, never finished, nothing open, no chunks', async () => {
    expect(await facts()).toEqual({
      clockStartAt: null,
      passed: false,
      lastFinishedAt: null,
      hasOpenAttempt: false,
      mastery: null,
    });
  });

  it('maps the shared fact columns: finish over ALL rows as ISO, open flag, passed, mastery', async () => {
    expect(
      await facts({
        lastFinishedAt: '2026-10-26 08:00:00+00',
        hasOpen: true,
        passed: true,
        chunksCleared: 5,
        chunksTotal: 7,
      }),
    ).toEqual({
      clockStartAt: null,
      passed: true,
      lastFinishedAt: '2026-10-26T08:00:00.000Z',
      hasOpenAttempt: true,
      mastery: { cleared: 5, total: 7 },
    });
  });

  it('selects the SAME fact fragments as the progress rollup, from lessons alone', async () => {
    await facts();
    const sel = m.selects[1] as Record<string, SQL>;
    const shared = debriefFactColumns('u1');
    for (const key of Object.keys(shared) as (keyof typeof shared)[]) {
      expect(renderSql(sel[key] as SQL)).toBe(renderSql(shared[key]));
      expect(renderSqlParams(sel[key] as SQL)).toEqual(
        renderSqlParams(shared[key]),
      );
    }
    const where = m.wheres[1] as SQL;
    expect(renderSql(where)).toBe(
      '("lessons"."id" = $1 and "lessons"."slug" = $2)',
    );
    expect(renderSqlParams(where)).toEqual([41, 'l1']);
  });

  it('reads doneAt from lesson_completions by user and lesson id', async () => {
    await facts({ doneAt: at('2026-10-25T00:00:00.000Z') });
    const where = m.wheres[0] as SQL;
    expect(renderSql(where)).toBe(
      '("lesson_completions"."user_id" = $1 and "lesson_completions"."lesson_id" = $2)',
    );
    expect(renderSqlParams(where)).toEqual(['u1', 41]);
  });

  it('a video lesson done without its video has not started the clock', async () => {
    expect(
      (await facts({ doneAt: at('2026-10-25T00:00:00.000Z'), hasVideo: true }))
        .clockStartAt,
    ).toBeNull();
  });

  it('with no video, the clock starts at the sticky completion', async () => {
    expect(
      (await facts({ doneAt: at('2026-10-25T00:00:00.000Z') })).clockStartAt,
    ).toBe('2026-10-25T00:00:00.000Z');
  });

  it('the clock starts when the video is watched, even before the lesson is done', async () => {
    expect(
      (await facts({ videoWatchedAt: '2026-10-24 06:00:00+00' })).clockStartAt,
    ).toBe('2026-10-24T06:00:00.000Z');
  });

  it('reads the video-watched time with the shared progress fragment, for this user and lesson id', async () => {
    await facts();
    expect(renderSql(m.selects[1]?.videoWatchedAt as SQL)).toBe(
      renderSql(videoWatchedAtSql('u1', lessonsTable.id)),
    );
    expect(renderSqlParams(m.selects[1]?.videoWatchedAt as SQL)).toEqual(
      renderSqlParams(videoWatchedAtSql('u1', lessonsTable.id)),
    );
  });
});

describe('getDebriefAttemptReports', () => {
  it('passed = a legacy attempt at or above 75, or a chunk attempt that cleared everything', async () => {
    const row = (
      id: number,
      totalScore: number,
      format: string | null,
      finishedReason: string | null,
    ) => ({
      id,
      totalScore,
      completedAt: at('2026-11-01T00:00:00.000Z'),
      questions: null,
      answers: null,
      format,
      finishedReason,
    });
    m.queue.push([
      row(1, 75, null, null),
      row(2, 74, null, null),
      row(3, 100, 'knowledge-chunks-v1', 'all-cleared'),
      // 6 of 7 chunks is 86% but NOT a pass: a hole is left.
      row(4, 86, 'knowledge-chunks-v1', 'all-answered'),
    ]);
    const reports = await getDebriefAttemptReports('u1', 'l1');
    expect(reports.map((r) => [r.id, r.passed])).toEqual([
      [1, true],
      [2, false],
      [3, true],
      [4, false],
    ]);
  });
});

/** A finished chunk-format row as stored: the full grading snapshot. */
const chunkRow = {
  id: 9,
  userId: 'u1',
  lessonSlug: 'l1',
  totalScore: 50,
  completedAt: at('2026-11-01T00:00:00.000Z'),
  createdAt: at('2026-11-01T00:00:00.000Z'),
  format: 'knowledge-chunks-v1',
  chunkVersion: 1,
  draft: null,
  finishedReason: 'all-answered',
  questions: {
    lessonSlug: 'l1',
    questions: [
      {
        id: 'q1',
        type: 'free-text',
        question: 'Why?',
        expectedAnswer: 'RUBRIC',
        chunkIds: ['v1-c1'],
      },
    ],
    chunks: [{ id: 'v1-c1', title: 'AoA', summary: 'SUMMARY' }],
    context: 'TRANSCRIPT',
  },
  answers: [
    {
      questionId: 'q1',
      type: 'free-text',
      score: 50,
      userAnswer: 'mine',
      explanation: 'note',
      chunkScores: { 'v1-c1': 50 },
      revisitNote: 'note',
    },
  ],
};
const leaks = (v: unknown) =>
  [
    'expectedAnswer',
    'RUBRIC',
    'chunkIds',
    'SUMMARY',
    'TRANSCRIPT',
    'context',
  ].filter((s) => JSON.stringify(v).includes(s));

describe('rows the client can receive never carry the grading key', () => {
  it('getTestResults (the results route) projects every row', async () => {
    m.queue.push([chunkRow]);
    const rows = await getTestResults('u1', 'l1');
    expect(leaks(rows)).toEqual([]);
    expect(rows[0]).toMatchObject({
      id: 9,
      totalScore: 50,
      questions: [{ id: 'q1', question: 'Why?' }],
      evaluations: [{ questionId: 'q1', score: 50, revisitNote: 'note' }],
    });
  });

  it('getDebriefAttemptReports (the passed branch of debrief-status) projects every row', async () => {
    m.queue.push([chunkRow]);
    const reports = await getDebriefAttemptReports('u1', 'l1');
    expect(leaks(reports)).toEqual([]);
    expect(reports[0].questions).toEqual([{ id: 'q1', question: 'Why?' }]);
  });
});
