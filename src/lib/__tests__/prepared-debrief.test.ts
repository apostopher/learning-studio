// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Key = { userId: string; courseId: number; lessonSlug: string };
type Row = { test: unknown; sourceFingerprint: string };

const m = vi.hoisted(() => ({
  claims: new Map<string, string>(),
  rows: new Map<string, { test: unknown; sourceFingerprint: string }>(),
  resolveDebriefSource: vi.fn(),
  generateTest: vi.fn(),
  upsertPreparedDebrief: vi.fn(),
}));

const rowKey = (k: Key) => `${k.userId}:${k.courseId}:${k.lessonSlug}`;

// A Map standing in for Upstash. Only the claim lock lives in Redis now; the
// prepared test itself is a Postgres row (it has to outlive the 24h wait).
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
vi.mock('#/lib/lesson-debrief-source.server', () => ({
  resolveDebriefSource: m.resolveDebriefSource,
}));
vi.mock('#/ai/generate-test', () => ({ generateTest: m.generateTest }));

import { deletePreparedDebrief } from '#/db/prepared-debriefs';
import {
  discardPreparedDebrief,
  prepareDebrief,
  sourceFingerprint,
  takePreparedDebrief,
} from '../prepared-debrief.server';

const k: Key = { userId: 'u1', courseId: 7, lessonSlug: 'l1' };
const test = {
  lessonSlug: 'l1',
  questions: [
    {
      id: 'q1',
      type: 'free-text',
      question: 'Why?',
      expectedAnswer: 'Because.',
      keyPointIndex: 0,
    },
  ],
};
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  m.claims.clear();
  m.rows.clear();
  m.upsertPreparedDebrief.mockImplementation(
    async (key: Key, t: unknown, fp: string) => {
      m.rows.set(rowKey(key), { test: t, sourceFingerprint: fp } satisfies Row);
    },
  );
  m.resolveDebriefSource.mockResolvedValue({
    kind: 'material',
    keyPoints: ['k'],
    text: 'body',
  });
  m.generateTest.mockResolvedValue(test);
});

describe('sourceFingerprint', () => {
  it('is the sha256 hex of the source text', () => {
    expect(sourceFingerprint('body')).toBe(sha256('body'));
    expect(sourceFingerprint('body')).not.toBe(sourceFingerprint('body2'));
  });
});

describe('prepareDebrief', () => {
  it('writes the test built from the resolved source, stamped with its fingerprint', async () => {
    expect(await prepareDebrief(k)).toBe('prepared');
    expect(m.resolveDebriefSource).toHaveBeenCalledWith('l1', 7);
    expect(m.generateTest).toHaveBeenCalledWith('l1', ['k'], 'body');
    expect(m.upsertPreparedDebrief).toHaveBeenCalledWith(
      k,
      test,
      sha256('body'),
    );
  });

  it('skips the model when a row with the CURRENT fingerprint already exists', async () => {
    m.rows.set(rowKey(k), { test, sourceFingerprint: sha256('body') });
    expect(await prepareDebrief(k)).toBe('already-prepared');
    expect(m.generateTest).not.toHaveBeenCalled();
    expect(m.upsertPreparedDebrief).not.toHaveBeenCalled();
  });

  it('regenerates over a row whose source has since changed', async () => {
    m.rows.set(rowKey(k), { test, sourceFingerprint: sha256('old body') });
    expect(await prepareDebrief(k)).toBe('prepared');
    expect(m.generateTest).toHaveBeenCalledOnce();
    expect(m.upsertPreparedDebrief).toHaveBeenCalledWith(
      k,
      test,
      sha256('body'),
    );
  });

  it('runs the model once while a claim is held (pause/play, reload)', async () => {
    await prepareDebrief(k);
    m.rows.clear(); // even with nothing stored, the claim dedupes
    expect(await prepareDebrief(k)).toBe('already-claimed');
    expect(m.generateTest).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when generation fails, so the next play retries', async () => {
    m.generateTest.mockRejectedValueOnce(new Error('model down'));
    await expect(prepareDebrief(k)).rejects.toThrow('model down');
    expect(await prepareDebrief(k)).toBe('prepared');
  });

  it('stores nothing for a lesson with no debrief source', async () => {
    m.resolveDebriefSource.mockResolvedValue(null);
    expect(await prepareDebrief(k)).toBe('no-source');
    expect(m.generateTest).not.toHaveBeenCalled();
    expect(m.upsertPreparedDebrief).not.toHaveBeenCalled();
  });

  it('deletes any stored row when the source is gone (ledger T8)', async () => {
    // A row left behind would keep the lesson debrief-bearing in the course
    // SQL (call 11) for a debrief nobody can now generate — so course percent
    // could never reach 100.
    m.rows.set(rowKey(k), { test, sourceFingerprint: sha256('body') });
    m.resolveDebriefSource.mockResolvedValue(null);
    expect(await prepareDebrief(k)).toBe('no-source');
    expect(vi.mocked(deletePreparedDebrief)).toHaveBeenCalledWith(k);
    expect(m.rows.has(rowKey(k))).toBe(false);
  });
});

describe('discardPreparedDebrief', () => {
  it('deletes the row for exactly this pilot, course and lesson', async () => {
    await discardPreparedDebrief(k);
    expect(vi.mocked(deletePreparedDebrief)).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      lessonSlug: 'l1',
    });
  });
});

describe('takePreparedDebrief', () => {
  it('returns the test once, so a retake gets fresh questions', async () => {
    await prepareDebrief(k);
    expect(await takePreparedDebrief(k, sha256('body'))).toEqual(test);
    expect(await takePreparedDebrief(k, sha256('body'))).toBeNull();
  });

  it('is per pilot', async () => {
    await prepareDebrief(k);
    expect(
      await takePreparedDebrief({ ...k, userId: 'u2' }, sha256('body')),
    ).toBeNull();
  });

  it('returns null on a fingerprint mismatch, and the stale row is gone', async () => {
    await prepareDebrief(k);
    expect(await takePreparedDebrief(k, sha256('edited body'))).toBeNull();
    expect(m.rows.has(rowKey(k))).toBe(false);
  });

  it('treats a row that no longer parses as a miss', async () => {
    m.rows.set(rowKey(k), {
      test: { nope: 1 },
      sourceFingerprint: sha256('body'),
    });
    expect(await takePreparedDebrief(k, sha256('body'))).toBeNull();
  });
});
