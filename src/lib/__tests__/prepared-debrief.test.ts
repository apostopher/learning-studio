// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Key = { userId: string; courseId: number; lessonSlug: string };
type Row = { test: unknown; sourceFingerprint: string };

const m = vi.hoisted(() => ({
  claims: new Map<string, string>(),
  rows: new Map<string, { test: unknown; sourceFingerprint: string }>(),
  ensureLessonChunks: vi.fn(),
  selectMastery: vi.fn(),
  selectAskedQuestions: vi.fn(),
  generateTest: vi.fn(),
  upsertPreparedDebrief: vi.fn(),
}));

const rowKey = (k: Key) => `${k.userId}:${k.courseId}:${k.lessonSlug}`;

// A Map standing in for Upstash: only the claim lock lives in Redis.
vi.mock('#/integrations/upstash/redis', () => ({
  redis: {
    set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean }) => {
      if (opts?.nx && m.claims.has(key)) return null;
      m.claims.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      m.claims.delete(key);
      return 1;
    }),
  },
}));
// A Map standing in for the `prepared_debriefs` table, keyed like its unique
// index (user, course, lesson).
vi.mock('#/db/prepared-debriefs', () => ({
  selectPreparedFingerprint: vi.fn(
    async (k: Key) => m.rows.get(rowKey(k))?.sourceFingerprint ?? null,
  ),
  upsertPreparedDebrief: m.upsertPreparedDebrief,
  deletePreparedDebrief: vi.fn(async (k: Key) => {
    const row = m.rows.get(rowKey(k)) ?? null;
    m.rows.delete(rowKey(k));
    return row;
  }),
}));
vi.mock('#/lib/knowledge-chunks.server', () => ({
  ensureLessonChunks: m.ensureLessonChunks,
}));
vi.mock('#/db/debrief-attempts', () => ({
  selectMastery: m.selectMastery,
  selectAskedQuestions: m.selectAskedQuestions,
}));
vi.mock('#/ai/generate-test', () => ({ generateTest: m.generateTest }));

import { deletePreparedDebrief } from '#/db/prepared-debriefs';
import { DEBRIEF_ATTEMPT_FORMAT } from '#/lib/debrief-attempt-snapshot';
import {
  discardPreparedDebrief,
  prepareDebrief,
  preparedFingerprint,
  takePreparedDebrief,
} from '../prepared-debrief.server';

const key: Key = { userId: 'u1', courseId: 7, lessonSlug: 'l1' };
const k = { ...key, lessonId: 41 };
const chunks = [
  { id: 'v2-c1', title: 'a', summary: 'A' },
  { id: 'v2-c2', title: 'b', summary: 'B' },
  { id: 'v2-c3', title: 'c', summary: 'C' },
];
const test = {
  lessonSlug: 'l1',
  questions: [
    {
      id: 'q1',
      type: 'free-text',
      question: 'Why?',
      expectedAnswer: 'Because.',
      chunkIds: ['v2-c2'],
    },
  ],
};
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** One cleared chunk (c1), one weak hole (c2), one never asked (c3). */
const masteryRows = [
  { chunkId: 'v2-c1', latestScore: 90, clearedAt: new Date() },
  { chunkId: 'v2-c2', latestScore: 40, clearedAt: null },
];
/** What the fingerprint is drawn over: `masteryOf(masteryRows)`. */
const mastery = masteryRows.map((r) => ({
  chunkId: r.chunkId,
  latestScore: r.latestScore,
  cleared: r.clearedAt !== null,
}));
/**
 * What `drawAttemptKeyPoints` makes of `masteryRows`: the miss (c2, 40)
 * first, then the never-asked c3, then c1 (answered well). One chunk per
 * group, so the shuffle cannot reorder it.
 */
const focus = { holes: ['v2-c2', 'v2-c3', 'v2-c1'], review: [] };

beforeEach(() => {
  vi.clearAllMocks();
  m.claims.clear();
  m.rows.clear();
  m.upsertPreparedDebrief.mockImplementation(
    async (kk: Key, t: unknown, fp: string) => {
      m.rows.set(rowKey(kk), { test: t, sourceFingerprint: fp } satisfies Row);
    },
  );
  m.ensureLessonChunks.mockResolvedValue({
    kind: 'ready',
    version: 2,
    chunks,
    context: 'ctx',
  });
  m.selectMastery.mockResolvedValue(masteryRows);
  m.selectAskedQuestions.mockResolvedValue(['Asked before?']);
  m.generateTest.mockResolvedValue(test);
});

describe('preparedFingerprint', () => {
  it('stamps the ONE shared format constant', () => {
    expect(DEBRIEF_ATTEMPT_FORMAT).toBe('knowledge-chunks-v1');
  });

  it('is sha256 of both formats, the chunk version and the mastery SORTED by chunk id', () => {
    expect(preparedFingerprint(2, mastery)).toBe(
      sha256(
        JSON.stringify([
          DEBRIEF_ATTEMPT_FORMAT,
          'key-point-sets-v1',
          2,
          [
            ['v2-c1', 90],
            ['v2-c2', 40],
          ],
        ]),
      ),
    );
  });

  it('ignores row order and the cleared flag, but not version or any score', () => {
    const fp = preparedFingerprint(2, mastery);
    expect(preparedFingerprint(2, [...mastery].reverse())).toBe(fp);
    expect(
      preparedFingerprint(
        2,
        mastery.map((r) => ({
          chunkId: r.chunkId,
          latestScore: r.latestScore,
        })),
      ),
    ).toBe(fp);
    expect(preparedFingerprint(3, mastery)).not.toBe(fp);
    expect(
      preparedFingerprint(2, [mastery[0], { ...mastery[1], latestScore: 41 }]),
    ).not.toBe(fp);
    expect(preparedFingerprint(2, [mastery[0]])).not.toBe(fp);
  });
});

describe('prepareDebrief', () => {
  it('generates for a draw over current mastery (misses first), avoiding questions already asked', async () => {
    expect(await prepareDebrief(k)).toBe('prepared');
    expect(m.ensureLessonChunks).toHaveBeenCalledWith(41, 'l1', 7);
    expect(m.selectMastery).toHaveBeenCalledWith('u1', 41);
    expect(m.selectAskedQuestions).toHaveBeenCalledWith('u1', 'l1');
    expect(m.generateTest).toHaveBeenCalledWith({
      lessonSlug: 'l1',
      chunks,
      context: 'ctx',
      focus,
      avoidQuestions: ['Asked before?'],
    });
    expect(m.upsertPreparedDebrief).toHaveBeenCalledWith(
      key,
      test,
      preparedFingerprint(2, mastery),
    );
  });

  it('skips the model when a test for the CURRENT version and mastery is stored', async () => {
    m.rows.set(rowKey(key), {
      test,
      sourceFingerprint: preparedFingerprint(2, mastery),
    });
    expect(await prepareDebrief(k)).toBe('already-prepared');
    expect(m.generateTest).not.toHaveBeenCalled();
  });

  it('regenerates when mastery moved on since the stored test', async () => {
    m.rows.set(rowKey(key), {
      test,
      // Drawn before c2 was answered.
      sourceFingerprint: preparedFingerprint(2, [mastery[0]]),
    });
    expect(await prepareDebrief(k)).toBe('prepared');
    expect(m.generateTest).toHaveBeenCalledOnce();
  });

  it('still asks once every current chunk is cleared: only a passing set passes', async () => {
    m.selectMastery.mockResolvedValue(
      chunks.map((c) => ({
        chunkId: c.id,
        latestScore: 90,
        clearedAt: new Date(),
      })),
    );
    expect(await prepareDebrief(k)).toBe('prepared');
    expect(m.generateTest.mock.calls[0][0].focus.holes).toHaveLength(3);
  });

  it('asks nothing only when there is nothing to draw', async () => {
    m.ensureLessonChunks.mockResolvedValue({
      kind: 'ready',
      version: 2,
      chunks: [],
      context: 'ctx',
    });
    expect(await prepareDebrief(k)).toBe('nothing-to-ask');
    expect(m.generateTest).not.toHaveBeenCalled();
  });

  it('runs the model once while a claim is held (pause/play, reload)', async () => {
    await prepareDebrief(k);
    m.rows.clear();
    expect(await prepareDebrief(k)).toBe('already-claimed');
    expect(m.generateTest).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when generation fails, so the next play retries', async () => {
    m.generateTest.mockRejectedValueOnce(new Error('model down'));
    await expect(prepareDebrief(k)).rejects.toThrow('model down');
    expect(await prepareDebrief(k)).toBe('prepared');
  });

  it('deletes any stored row and stores nothing when the lesson has no chunks (ledger T8)', async () => {
    m.rows.set(rowKey(key), { test, sourceFingerprint: 'x' });
    m.ensureLessonChunks.mockResolvedValue({ kind: 'no-source' });
    expect(await prepareDebrief(k)).toBe('no-source');
    expect(vi.mocked(deletePreparedDebrief)).toHaveBeenCalledWith(key);
    expect(m.rows.has(rowKey(key))).toBe(false);
    expect(m.generateTest).not.toHaveBeenCalled();
  });

  it('chunks busy (first generation in flight elsewhere): keeps any prepared row and releases its claim so a later play retries', async () => {
    m.ensureLessonChunks.mockResolvedValue({ kind: 'busy' });
    expect(await prepareDebrief(k)).toBe('chunks-busy');
    expect(vi.mocked(deletePreparedDebrief)).not.toHaveBeenCalled();
    expect(m.generateTest).not.toHaveBeenCalled();
    expect(await prepareDebrief(k)).toBe('chunks-busy');
  });
});

describe('discardPreparedDebrief', () => {
  it('deletes the row for exactly this pilot, course and lesson', async () => {
    await discardPreparedDebrief(key);
    expect(vi.mocked(deletePreparedDebrief)).toHaveBeenCalledWith(key);
  });
});

describe('takePreparedDebrief', () => {
  const fp = () => preparedFingerprint(2, mastery);

  it('returns the test once, so a retake gets fresh questions', async () => {
    await prepareDebrief(k);
    expect(await takePreparedDebrief(key, fp())).toEqual(test);
    expect(await takePreparedDebrief(key, fp())).toBeNull();
  });

  it('is per pilot', async () => {
    await prepareDebrief(k);
    expect(
      await takePreparedDebrief({ ...key, userId: 'u2' }, fp()),
    ).toBeNull();
  });

  it('returns null on a fingerprint mismatch, and the stale row is gone', async () => {
    await prepareDebrief(k);
    expect(
      await takePreparedDebrief(key, preparedFingerprint(3, mastery)),
    ).toBeNull();
    expect(m.rows.has(rowKey(key))).toBe(false);
  });

  it('treats an untagged (pre-chunk) or unreadable row as a miss', async () => {
    m.rows.set(rowKey(key), {
      test: {
        lessonSlug: 'l1',
        questions: [{ ...test.questions[0], chunkIds: undefined }],
      },
      sourceFingerprint: fp(),
    });
    expect(await takePreparedDebrief(key, fp())).toBeNull();
    m.rows.set(rowKey(key), { test: { nope: 1 }, sourceFingerprint: fp() });
    expect(await takePreparedDebrief(key, fp())).toBeNull();
  });
});
