import { describe, expect, it } from 'vitest';
import {
  applyChunkScore,
  CHUNK_CLEAR_SCORE,
  type ChunkMastery,
  isAllCleared,
  type KnowledgeChunk,
  MAX_KNOWLEDGE_CHUNKS,
  masteryPercent,
  planAttemptFocus,
} from '#/lib/debrief-mastery';

const chunks = (n: number): KnowledgeChunk[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    title: `Chunk ${i + 1}`,
    summary: `Summary ${i + 1}`,
  }));

const row = (chunkId: string, latestScore: number, cleared: boolean) => ({
  chunkId,
  latestScore,
  cleared,
});

describe('constants', () => {
  it('clears at 70 and caps an attempt at 8 chunks', () => {
    expect(CHUNK_CLEAR_SCORE).toBe(70);
    expect(MAX_KNOWLEDGE_CHUNKS).toBe(8);
  });
});

describe('applyChunkScore', () => {
  it('clears at the threshold', () => {
    expect(applyChunkScore(undefined, 'c1', 70)).toEqual(row('c1', 70, true));
  });
  it('does not clear below the threshold', () => {
    expect(applyChunkScore(undefined, 'c1', 69).cleared).toBe(false);
  });
  it('cleared stays cleared but latestScore records the new score', () => {
    expect(applyChunkScore(row('c1', 90, true), 'c1', 20)).toEqual(
      row('c1', 20, true),
    );
  });
  it('an uncleared chunk clears on a passing score', () => {
    expect(applyChunkScore(row('c1', 30, false), 'c1', 80).cleared).toBe(true);
  });
});

describe('masteryPercent', () => {
  it('is the rounded share of cleared chunks', () => {
    expect(masteryPercent({ cleared: 5, total: 7, passed: false })).toBe(71);
  });
  it('is 100 once passed', () => {
    expect(masteryPercent({ cleared: 4, total: 8, passed: true })).toBe(100);
  });
  it('is 0 with no chunks', () => {
    expect(masteryPercent({ cleared: 0, total: 0, passed: false })).toBe(0);
  });
});

describe('isAllCleared', () => {
  it('requires every chunk to be cleared', () => {
    const cs = chunks(2);
    expect(isAllCleared(cs, [row('c1', 80, true), row('c2', 80, true)])).toBe(
      true,
    );
    expect(isAllCleared(cs, [row('c1', 80, true), row('c2', 50, false)])).toBe(
      false,
    );
    expect(isAllCleared(cs, [row('c1', 80, true)])).toBe(false);
  });
  it('is false with no chunks', () => {
    expect(isAllCleared([], [])).toBe(false);
  });
});

describe('planAttemptFocus', () => {
  it('first attempt: every chunk is a hole, in order, no review', () => {
    expect(planAttemptFocus(chunks(7), [])).toEqual({
      holes: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'],
      review: [],
    });
  });

  it('holes are the uncleared chunks; review is two cleared ones', () => {
    const mastery: ChunkMastery[] = [
      row('c1', 90, true),
      row('c2', 80, true),
      row('c3', 75, true),
      row('c4', 95, true),
      row('c5', 71, true),
      row('c6', 40, false),
      row('c7', 55, false),
    ];
    const plan = planAttemptFocus(chunks(7), mastery);
    expect(plan.holes).toEqual(['c6', 'c7']);
    expect(plan.review).toEqual(['c5', 'c3']);
  });

  it('orders holes lowest score first and caps them', () => {
    const cs = chunks(10);
    const mastery = cs.map((c, i) => row(c.id, 50 - i, false));
    const plan = planAttemptFocus(cs, mastery);
    expect(plan.holes).toHaveLength(MAX_KNOWLEDGE_CHUNKS);
    expect(plan.holes[0]).toBe('c10');
    expect(plan.review).toEqual([]);
  });

  it('treats a chunk with no row as an uncleared hole once mastery exists', () => {
    const plan = planAttemptFocus(chunks(3), [row('c1', 90, true)]);
    expect(plan.holes).toEqual(['c2', 'c3']);
    expect(plan.review).toEqual(['c1']);
  });
});
