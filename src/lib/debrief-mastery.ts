/** One idea the lesson teaches, produced by chunk generation. */
export type KnowledgeChunk = {
  /** Stable within a chunk version, e.g. "c1". */
  id: string;
  title: string;
  summary: string;
};

export type ChunkMastery = {
  chunkId: string;
  latestScore: number;
  cleared: boolean;
};

/** A chunk is cleared the first time it scores at least this. */
export const CHUNK_CLEAR_SCORE = 70;
/** The most chunks one attempt asks about. */
export const MAX_KNOWLEDGE_CHUNKS = 8;
/** Cleared chunks mixed back into a retake as spaced review. */
const MAX_REVIEW_CHUNKS = 2;

/** Cleared stays cleared; `latestScore` always records the newest score. */
export function applyChunkScore(
  prev: ChunkMastery | undefined,
  chunkId: string,
  score: number,
): ChunkMastery {
  return {
    chunkId,
    latestScore: score,
    cleared: (prev?.cleared ?? false) || score >= CHUNK_CLEAR_SCORE,
  };
}

/** Percent of chunks cleared; 100 once passed, 0 with no chunks. */
export function masteryPercent(m: {
  cleared: number;
  total: number;
  passed: boolean;
}): number {
  if (m.passed) return 100;
  if (m.total <= 0) return 0;
  return Math.round((m.cleared / m.total) * 100);
}

export function isAllCleared(
  chunks: KnowledgeChunk[],
  mastery: ChunkMastery[],
): boolean {
  if (chunks.length === 0) return false;
  const cleared = new Set(
    mastery.filter((m) => m.cleared).map((m) => m.chunkId),
  );
  return chunks.every((c) => cleared.has(c.id));
}

/**
 * Which chunks the next attempt asks about. Holes are uncleared chunks
 * (lowest latest score first, a chunk with no row counts as score 0);
 * review is up to two cleared chunks, weakest first. With no mastery rows
 * at all it is a first attempt: every chunk is a hole, in order.
 */
export function planAttemptFocus(
  chunks: KnowledgeChunk[],
  mastery: ChunkMastery[],
): { holes: string[]; review: string[] } {
  if (mastery.length === 0) {
    return { holes: chunks.map((c) => c.id), review: [] };
  }
  const byId = new Map(mastery.map((m) => [m.chunkId, m]));
  const scored = chunks.map((c, index) => ({
    id: c.id,
    index,
    cleared: byId.get(c.id)?.cleared ?? false,
    score: byId.get(c.id)?.latestScore ?? 0,
  }));
  const weakestFirst = (
    a: (typeof scored)[number],
    b: (typeof scored)[number],
  ) => a.score - b.score || a.index - b.index;
  return {
    holes: scored
      .filter((c) => !c.cleared)
      .sort(weakestFirst)
      .slice(0, MAX_KNOWLEDGE_CHUNKS)
      .map((c) => c.id),
    review: scored
      .filter((c) => c.cleared)
      .sort(weakestFirst)
      .slice(0, MAX_REVIEW_CHUNKS)
      .map((c) => c.id),
  };
}
