import { describe, expect, it } from 'vitest';
import {
  applyChunkScore,
  CHUNK_CLEAR_SCORE,
  type ChunkMastery,
  debriefPassedOf,
  drawAttemptKeyPoints,
  type KnowledgeChunk,
  MAX_ATTEMPT_KEY_POINTS,
  MAX_KNOWLEDGE_CHUNKS,
  masteryOf,
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
  it('clears at 70 and caps an attempt at 12 chunks', () => {
    expect(CHUNK_CLEAR_SCORE).toBe(70);
    expect(MAX_KNOWLEDGE_CHUNKS).toBe(12);
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

/**
 * `random` for the shuffle: just under 1 makes Fisher–Yates swap every item
 * with itself, so each group keeps its input order and the test can read the
 * grouping alone.
 */
const inOrder = () => 0.999_999;

describe('debriefPassedOf', () => {
  // 2026-11-18: a pass comes only from a set of answers (the pass row). A
  // pilot who has cleared every chunk across attempts has not passed.
  it('is the pass row, and nothing else', () => {
    expect(debriefPassedOf({ debriefPassed: true })).toBe(true);
    expect(debriefPassedOf({ debriefPassed: false })).toBe(false);
    expect(
      debriefPassedOf({
        debriefPassed: false,
        chunksCleared: 7,
        chunksTotal: 7,
      } as { debriefPassed: boolean }),
    ).toBe(false);
  });
});

describe('drawAttemptKeyPoints', () => {
  it('asks at most eight key points', () => {
    expect(MAX_ATTEMPT_KEY_POINTS).toBe(8);
    expect(drawAttemptKeyPoints(chunks(10), [], inOrder)).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
      'c6',
      'c7',
      'c8',
    ]);
  });

  it('asks every key point of a short lesson, each once', () => {
    expect(drawAttemptKeyPoints(chunks(5), [], inOrder)).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
    ]);
  });

  it('puts misses (latest score under 75) first, then unasked, then strong', () => {
    const mastery: ChunkMastery[] = [
      row('c1', 90, true),
      row('c2', 74, true), // cleared at 70 but still a miss against 75
      row('c3', 75, true),
      row('c4', 20, false),
    ];
    expect(drawAttemptKeyPoints(chunks(6), mastery, inOrder)).toEqual([
      'c2',
      'c4',
      'c5',
      'c6',
      'c1',
      'c3',
    ]);
  });

  it('is a random draw within each group', () => {
    // 0 makes Fisher–Yates swap each item with the first: a visible reorder.
    const first = drawAttemptKeyPoints(chunks(4), [], () => 0);
    expect(first).not.toEqual(['c1', 'c2', 'c3', 'c4']);
    expect([...first].sort()).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('never repeats a key point and draws only from the current chunks', () => {
    const cs = chunks(10);
    // A row for a chunk the lesson no longer has is ignored.
    const mastery = [row('c3', 10, false), row('gone', 10, false)];
    for (let seed = 0; seed < 20; seed++) {
      let x = seed / 20;
      const random = () => {
        x = (x * 9301 + 0.49297) % 1;
        return x;
      };
      const drawn = drawAttemptKeyPoints(cs, mastery, random);
      expect(drawn).toHaveLength(8);
      expect(new Set(drawn).size).toBe(8);
      expect(drawn[0]).toBe('c3');
      for (const id of drawn) expect(cs.map((c) => c.id)).toContain(id);
    }
  });

  it('draws nothing from a lesson with no chunks', () => {
    expect(drawAttemptKeyPoints([], [], inOrder)).toEqual([]);
  });
});

describe('masteryOf (stored rows → mastery against the CURRENT chunk list)', () => {
  const current = [
    { id: 'v2-c1', title: 'a', summary: '' },
    { id: 'v2-c2', title: 'b', summary: '' },
    { id: 'v2-c3', title: 'c', summary: '' },
  ];
  const stored = [
    { chunkId: 'v2-c1', latestScore: 80, clearedAt: new Date() },
    { chunkId: 'v2-c2', latestScore: 40, clearedAt: null },
    // A previous version's row (a passed pilot's, never carried over): not counted.
    { chunkId: 'v1-c9', latestScore: 90, clearedAt: new Date() },
  ];

  it('keeps only rows for current chunk ids, cleared = clearedAt set', () => {
    expect(masteryOf(current, stored)).toEqual([
      { chunkId: 'v2-c1', latestScore: 80, cleared: true },
      { chunkId: 'v2-c2', latestScore: 40, cleared: false },
    ]);
  });
});
