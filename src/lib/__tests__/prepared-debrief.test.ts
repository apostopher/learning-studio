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
/** What `planAttemptFocus` makes of `masteryRows`. */
const focus = { holes: ['v2-c3', 'v2-c2'], review: ['v2-c1'] };

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

  it('is sha256 of the format, the chunk version and the SORTED focus ids', () => {
    expect(preparedFingerprint(2, focus)).toBe(
      sha256(
        JSON.stringify([
          DEBRIEF_ATTEMPT_FORMAT,
          2,
          ['v2-c2', 'v2-c3'],
          ['v2-c1'],
        ]),
      ),
    );
  });

  it('ignores focus order but not version, holes or review', () => {
    const fp = preparedFingerprint(2, focus);
    expect(
      preparedFingerprint(2, { holes: ['v2-c2', 'v2-c3'], review: ['v2-c1'] }),
    ).toBe(fp);
    expect(preparedFingerprint(3, focus)).not.toBe(fp);
    expect(
      preparedFingerprint(2, { holes: ['v2-c3'], review: ['v2-c1', 'v2-c2'] }),
    ).not.toBe(fp);
  });
});

describe('prepareDebrief', () => {
  it('generates for the focus current mastery calls for, avoiding questions already asked', async () => {
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
      preparedFingerprint(2, focus),
    );
  });

  it('skips the model when a test for the CURRENT version and focus is stored', async () => {
    m.rows.set(rowKey(key), {
      test,
      sourceFingerprint: preparedFingerprint(2, focus),
    });
    expect(await prepareDebrief(k)).toBe('already-prepared');
    expect(m.generateTest).not.toHaveBeenCalled();
  });

  it('regenerates when mastery moved on since the stored test', async () => {
    m.rows.set(rowKey(key), {
      test,
      sourceFingerprint: preparedFingerprint(2, {
        holes: ['v2-c1', 'v2-c2', 'v2-c3'],
        review: [],
      }),
    });
    expect(await prepareDebrief(k)).toBe('prepared');
    expect(m.generateTest).toHaveBeenCalledOnce();
  });

  it('asks nothing once every current chunk is cleared', async () => {
    m.selectMastery.mockResolvedValue(
      chunks.map((c) => ({
        chunkId: c.id,
        latestScore: 90,
        clearedAt: new Date(),
      })),
    );
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
  const fp = () => preparedFingerprint(2, focus);

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
      await takePreparedDebrief(key, preparedFingerprint(3, focus)),
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
