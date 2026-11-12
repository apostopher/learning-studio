// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

/**
 * Records every builder call (`select`, `from`, `where`, `for`, `values`,
 * `onConflictDoUpdate`, ...) and resolves the chain with the next queued
 * result, so a test can assert on exactly what each query was built with.
 */
const m = vi.hoisted(() => ({
  calls: [] as { op: string; args: unknown[] }[],
  queue: [] as unknown[],
}));

function chain(): unknown {
  const target = {} as Record<string, unknown>;
  const proxy: unknown = new Proxy(target, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const result = m.queue.length > 0 ? m.queue.shift() : [];
        return (res: (v: unknown) => unknown) => res(result);
      }
      return (...args: unknown[]) => {
        m.calls.push({ op: prop, args });
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('#/db', () => ({
  db: new Proxy(
    {},
    {
      get:
        (_t, prop: string) =>
        (...args: unknown[]) => {
          m.calls.push({ op: prop, args });
          return chain();
        },
    },
  ),
}));

import { db } from '#/db';
import {
  insertAnswerLog,
  insertAttempt,
  insertPass,
  lockAttempt,
  selectAskedQuestions,
  selectOpenAttempt,
  updateDraft,
  upsertMastery,
} from '#/db/debrief-attempts';

const call = (op: string, n = 0) => m.calls.filter((c) => c.op === op)[n];
const whereSql = (n = 0) => renderSql(call('where', n).args[0] as SQL);
const whereParams = (n = 0) => renderSqlParams(call('where', n).args[0] as SQL);

beforeEach(() => {
  m.calls.length = 0;
  m.queue.length = 0;
});

describe('selectOpenAttempt', () => {
  it('finds only this pilot’s UNFINISHED chunk-format attempt on this lesson', async () => {
    m.queue.push([{ id: 3 }]);
    expect(await selectOpenAttempt('u1', 'l1')).toEqual({ id: 3 });
    expect(whereSql()).toBe(
      '("lesson_test_results"."user_id" = $1 and "lesson_test_results"."lesson_slug" = $2 and "lesson_test_results"."completed_at" is null and "lesson_test_results"."format" = $3)',
    );
    expect(whereParams()).toEqual(['u1', 'l1', 'knowledge-chunks-v1']);
  });

  it('null when there is none', async () => {
    expect(await selectOpenAttempt('u1', 'l1')).toBeNull();
  });
});

describe('insertAttempt', () => {
  const stored = {
    lessonSlug: 'l1',
    questions: [],
    chunks: [],
    context: 'ctx',
  };

  it('writes a chunk-format row with no answers, and loses quietly to a concurrent start', async () => {
    m.queue.push([{ id: 9 }]);
    expect(
      await insertAttempt({
        userId: 'u1',
        lessonSlug: 'l1',
        stored,
        chunkVersion: 2,
      }),
    ).toEqual({ id: 9 });
    expect(call('values').args[0]).toEqual({
      userId: 'u1',
      lessonSlug: 'l1',
      questions: stored,
      answers: [],
      format: 'knowledge-chunks-v1',
      chunkVersion: 2,
    });
    // The partial unique index (one open attempt per pilot and lesson) is
    // the guard; a conflict inserts nothing rather than throwing.
    expect(call('onConflictDoNothing')).toBeDefined();
  });

  it('null when the insert conflicted', async () => {
    m.queue.push([]);
    expect(
      await insertAttempt({
        userId: 'u1',
        lessonSlug: 'l1',
        stored,
        chunkVersion: 2,
      }),
    ).toBeNull();
  });
});

describe('lockAttempt', () => {
  it('selects the attempt row FOR UPDATE inside the given transaction', async () => {
    const tx = db as never;
    m.queue.push([{ id: 4 }]);
    expect(await lockAttempt(tx, 4)).toEqual({ id: 4 });
    expect(call('for').args).toEqual(['update']);
    expect(whereSql()).toBe('"lesson_test_results"."id" = $1');
    expect(whereParams()).toEqual([4]);
  });
});

describe('updateDraft', () => {
  it('writes only to the pilot’s own UNFINISHED chunk-format attempt', async () => {
    m.queue.push([{ id: 4 }]);
    expect(
      await updateDraft('u1', 4, { questionId: 'q2', text: 'half an answer' }),
    ).toBe(true);
    expect(call('set').args[0]).toEqual({
      draft: { questionId: 'q2', text: 'half an answer' },
    });
    expect(whereSql()).toBe(
      '("lesson_test_results"."id" = $1 and "lesson_test_results"."user_id" = $2 and "lesson_test_results"."completed_at" is null and "lesson_test_results"."format" = $3)',
    );
    expect(whereParams()).toEqual([4, 'u1', 'knowledge-chunks-v1']);
  });

  it('false when nothing matched (another pilot’s, or finished)', async () => {
    m.queue.push([]);
    expect(await updateDraft('u1', 4, { questionId: 'q2', text: 'x' })).toBe(
      false,
    );
  });
});

describe('upsertMastery', () => {
  it('on conflict keeps an existing clearedAt (cleared stays cleared) and records the new score', async () => {
    const row = {
      userId: 'u1',
      lessonId: 41,
      chunkId: 'v2-c1',
      latestScore: 10,
      clearedAt: null,
    };
    await upsertMastery(db as never, [row]);
    expect(call('values').args[0]).toEqual([row]);
    const conflict = call('onConflictDoUpdate').args[0] as {
      target: unknown[];
      set: { clearedAt: SQL; latestScore: SQL };
    };
    expect(conflict.target).toHaveLength(3);
    expect(renderSql(conflict.set.clearedAt)).toBe(
      'coalesce("debrief_chunk_mastery"."cleared_at", excluded.cleared_at)',
    );
    expect(renderSql(conflict.set.latestScore)).toBe('excluded.latest_score');
  });

  it('writes nothing for no rows', async () => {
    await upsertMastery(db as never, []);
    expect(call('insert')).toBeUndefined();
  });
});

describe('insertAnswerLog / insertPass', () => {
  it('one log per (attempt, question): a duplicate is ignored', async () => {
    const metrics = {
      msOnQuestion: 1,
      msToFirstKey: 1,
      deletions: 0,
      charsDeleted: 0,
      rewrites: 0,
      pasteBlocked: 0,
      msHidden: 0,
      finalLength: 3,
    };
    await insertAnswerLog(db as never, {
      attemptId: 4,
      questionId: 'q1',
      metrics,
    });
    expect(call('values').args[0]).toEqual({
      attemptId: 4,
      questionId: 'q1',
      metrics,
    });
    expect(call('onConflictDoNothing')).toBeDefined();
  });

  it('a pass is inserted once, permanently', async () => {
    await insertPass(db as never, { userId: 'u1', lessonSlug: 'l1' });
    expect(call('values').args[0]).toEqual({ userId: 'u1', lessonSlug: 'l1' });
    expect(call('onConflictDoNothing')).toBeDefined();
  });
});

describe('selectAskedQuestions', () => {
  it('every question text this pilot has been asked on the lesson, legacy rows included', async () => {
    m.queue.push([
      // Legacy shape: the whole AITest.
      {
        questions: {
          lessonSlug: 'l1',
          questions: [
            {
              id: 'q1',
              type: 'free-text',
              question: 'Old one?',
              expectedAnswer: 'a',
              keyPointIndex: 0,
            },
            {
              id: 'q2',
              type: 'mcq',
              question: 'Pick one?',
              options: [
                { id: 'a', value: 'a' },
                { id: 'b', value: 'b' },
                { id: 'c', value: 'c' },
                { id: 'd', value: 'd' },
              ],
              correctOptionId: 'a',
              keyPointIndex: 0,
            },
          ],
        },
      },
      // Chunk format: the snapshot.
      {
        questions: {
          lessonSlug: 'l1',
          questions: [
            {
              id: 'q1',
              type: 'free-text',
              question: 'New one?',
              expectedAnswer: 'b',
              chunkIds: ['v1-c1'],
            },
          ],
          chunks: [],
          context: 'ctx',
        },
      },
      { questions: 'unreadable' },
    ]);
    expect(await selectAskedQuestions('u1', 'l1')).toEqual([
      'Old one?',
      'Pick one?',
      'New one?',
    ]);
    expect(whereSql()).toBe(
      '("lesson_test_results"."user_id" = $1 and "lesson_test_results"."lesson_slug" = $2)',
    );
  });
});
