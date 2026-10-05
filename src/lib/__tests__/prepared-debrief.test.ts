// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  resolveDebriefSource: vi.fn(),
  generateTest: vi.fn(),
}));

// A Map standing in for Upstash, honouring the two options this module relies
// on: `nx` (the claim) and getdel's read-once.
vi.mock('#/integrations/upstash/redis', () => ({
  redis: {
    set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean }) => {
      if (opts?.nx && m.store.has(key)) return null;
      m.store.set(key, value);
      return 'OK';
    }),
    getdel: vi.fn(async (key: string) => {
      const value = m.store.get(key);
      m.store.delete(key);
      // Upstash deserialises JSON on read.
      return typeof value === 'string' ? JSON.parse(value) : (value ?? null);
    }),
    del: vi.fn(async (key: string) => {
      m.store.delete(key);
      return 1;
    }),
  },
}));
vi.mock('#/lib/lesson-debrief-source.server', () => ({
  resolveDebriefSource: m.resolveDebriefSource,
}));
vi.mock('#/ai/generate-test', () => ({ generateTest: m.generateTest }));

import {
  prepareDebrief,
  takePreparedDebrief,
} from '../prepared-debrief.server';

const k = { userId: 'u1', courseId: 7, lessonSlug: 'l1' };
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

beforeEach(() => {
  vi.clearAllMocks();
  m.store.clear();
  m.resolveDebriefSource.mockResolvedValue({
    kind: 'material',
    keyPoints: ['k'],
    text: 'body',
  });
  m.generateTest.mockResolvedValue(test);
});

describe('prepared debrief', () => {
  it('hands the prepared test to the next take, built from the resolved source', async () => {
    expect(await prepareDebrief(k)).toBe('prepared');
    expect(m.resolveDebriefSource).toHaveBeenCalledWith('l1', 7);
    expect(m.generateTest).toHaveBeenCalledWith('l1', ['k'], 'body');
    expect(await takePreparedDebrief(k)).toEqual(test);
  });

  it('is served once, so a Retake gets fresh questions', async () => {
    await prepareDebrief(k);
    await takePreparedDebrief(k);
    expect(await takePreparedDebrief(k)).toBeNull();
  });

  it('is per pilot', async () => {
    await prepareDebrief(k);
    expect(await takePreparedDebrief({ ...k, userId: 'u2' })).toBeNull();
  });

  it('runs the model once while a claim is held (pause/play, reload)', async () => {
    await prepareDebrief(k);
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
    expect(await takePreparedDebrief(k)).toBeNull();
  });

  it('treats an entry that no longer parses as a miss', async () => {
    m.store.set('prepared-debrief:ready:u1:7:l1', JSON.stringify({ nope: 1 }));
    expect(await takePreparedDebrief(k)).toBeNull();
  });
});
