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
/**
 * The most chunks a lesson has, and so the most one attempt asks about. Sized
 * so no authored key point is ever merged away: lessons carry up to 10 (101
 * prod lessons have exactly 10 as of 2026-11-18), plus room for 2 ideas only
 * the transcript teaches. At 8, every 10-point lesson silently lost two, and
 * their debrief questions had no chunk to be graded against.
 */
export const MAX_KNOWLEDGE_CHUNKS = 12;

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

/** Stored chunk counts as `DebriefFacts.mastery`: null when no chunks are stored. */
export function masteryFromCounts(
  cleared: number,
  total: number | null,
): { cleared: number; total: number } | null {
  return total === null ? null : { cleared, total };
}

/**
 * Whether the debrief counts as passed: a permanent pass row, and nothing
 * else. Since 2026-11-18 a pass is earned only by a set of questions
 * averaging `DEBRIEF_SET_PASS_SCORE` (`#/lib/debrief-sets`); clearing every
 * chunk across attempts no longer passes on its own. Every reader (the status
 * route, the ring, the course percent) goes through this one rule so they can
 * never disagree.
 */
export function debriefPassedOf(f: { debriefPassed: boolean }): boolean {
  return f.debriefPassed;
}

/** At most how many key points one attempt asks about: two sets of four. */
export const MAX_ATTEMPT_KEY_POINTS = 8;

/**
 * A chunk counts as missed when its latest score is under the set pass mark:
 * an answer that scored 72 would not have carried a set on its own.
 */
const MISSED_BELOW = 75;

/** Fisher–Yates over a copy, with an injectable `random` for tests. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The key points (chunk ids) the next attempt asks about, in the order they
 * are asked: up to `MAX_ATTEMPT_KEY_POINTS`, never one twice. Set 1 is the
 * first four, set 2 the rest (`#/lib/debrief-sets`).
 *
 * Random, so each attempt is a fresh draw. On a retake the pilot's misses
 * come first (latest score under 75), then key points never asked, then the
 * ones they answered well, each group shuffled on its own. A first attempt
 * (no mastery) is one random draw over all of them.
 */
export function drawAttemptKeyPoints(
  chunks: KnowledgeChunk[],
  mastery: ChunkMastery[],
  random: () => number = Math.random,
): string[] {
  const byId = new Map(mastery.map((m) => [m.chunkId, m]));
  const missed: string[] = [];
  const unasked: string[] = [];
  const strong: string[] = [];
  for (const c of chunks) {
    const m = byId.get(c.id);
    if (m === undefined) unasked.push(c.id);
    else if (m.latestScore < MISSED_BELOW) missed.push(c.id);
    else strong.push(c.id);
  }
  return [
    ...shuffled(missed, random),
    ...shuffled(unasked, random),
    ...shuffled(strong, random),
  ].slice(0, MAX_ATTEMPT_KEY_POINTS);
}

/** A stored mastery row, as far as the rules here care. */
type StoredMastery = {
  chunkId: string;
  latestScore: number;
  clearedAt: Date | null;
};

/**
 * Stored mastery rows as `ChunkMastery`, keeping only rows for `chunks` (the
 * lesson's CURRENT list). Rows for an older version — kept for pilots who
 * passed before a regeneration — never count.
 */
export function masteryOf(
  chunks: KnowledgeChunk[],
  rows: StoredMastery[],
): ChunkMastery[] {
  const current = new Set(chunks.map((c) => c.id));
  return rows
    .filter((r) => current.has(r.chunkId))
    .map((r) => ({
      chunkId: r.chunkId,
      latestScore: r.latestScore,
      cleared: r.clearedAt !== null,
    }));
}
