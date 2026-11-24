import { createHash } from 'node:crypto';
import { generateKnowledgeChunks } from '#/ai/generate-knowledge-chunks';
import { matchKnowledgeChunks } from '#/ai/match-knowledge-chunks';
import { db } from '#/db';
import {
  deleteStaleMastery,
  type Executor,
  insertCarriedMastery,
  nextChunkVersion,
  selectLessonChunks,
  selectStaleMastery,
  upsertLessonChunks,
} from '#/db/knowledge-chunks';
import { redis } from '#/integrations/upstash/redis';
import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import {
  type DebriefSource,
  resolveDebriefSource,
} from '#/lib/lesson-debrief-source.server';

/**
 * Bump with any change a stored chunk list must not outlive. v2: one chunk per
 * key point, never merged, under a cap of 12 (v1 capped at 8 and merged).
 * v3: key points only, no extra chunks from the transcript (the debrief asks
 * about key points only). Bumping regenerates each lesson's chunks on next use; mastery carries over
 * through the old -> new matching.
 */
const CHUNKS_FORMAT = 'knowledge-chunks-v3';
const CLAIM_TTL_SECONDS = 60 * 5;

const claimKey = (lessonVersionId: number) =>
  `knowledge-chunks:claim:${lessonVersionId}`;

/** sha256 hex of the format tag, key points and context the chunks derive from. */
export function chunkFingerprint(source: {
  keyPoints: string[];
  context: string;
}): string {
  return createHash('sha256')
    .update(JSON.stringify([CHUNKS_FORMAT, source.keyPoints, source.context]))
    .digest('hex');
}

/** The version in a stored chunk id (`v2-c3` -> 2), or null for any other id. */
export function chunkIdVersion(id: string): number | null {
  const m = /^v(\d+)-/.exec(id);
  return m ? Number(m[1]) : null;
}

/**
 * Re-key scores onto a snapshot's current chunk ids. Current ids pass through,
 * ids of the list it replaced go through `mapping`, and the rest are dropped:
 * an older list's, and another snapshot's, which are other key points.
 */
export function mapToCurrentChunkIds(
  scores: Record<string, number>,
  mapping: Record<string, string | null> | null,
  currentVersion: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, score] of Object.entries(scores)) {
    const current = chunkIdVersion(id) === currentVersion ? id : mapping?.[id];
    if (current) out[current] = score;
  }
  return out;
}

/**
 * What `ensureLessonChunks` found:
 * - `ready`: the snapshot's current chunks, plus the context they were resolved
 *   alongside — what question generation reads next, returned so a caller
 *   does not resolve the source (a transcript fetch) a second time;
 * - `no-source`: there is nothing to debrief from (no source, or generation
 *   produced no chunks);
 * - `busy`: another request is generating this snapshot's FIRST chunk list and
 *   it did not land within `CHUNKS_BUSY_WAIT_MS`. Retry shortly — this is not
 *   "nothing to debrief".
 */
export type EnsuredChunks =
  | {
      kind: 'ready';
      lessonVersionId: number;
      version: number;
      chunks: KnowledgeChunk[];
      context: string;
    }
  | { kind: 'no-source' }
  | { kind: 'busy' };

/** How often a caller waiting on another's first generation re-reads. */
export const CHUNKS_BUSY_POLL_MS = 500;
/** How long it waits before answering `busy`. */
export const CHUNKS_BUSY_WAIT_MS = 6_000;

const ready = (
  row: { version: number; chunks: KnowledgeChunk[] },
  source: DebriefSource,
): EnsuredChunks => ({
  kind: 'ready',
  lessonVersionId: source.lessonVersionId,
  version: row.version,
  chunks: row.chunks,
  context: source.context,
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The current knowledge chunks of the lesson as this course has it, generating
 * them when missing or when the source changed. One list per snapshot, shared
 * by the courses on it. Stored ids carry the list's number (`v2-c3`).
 *
 * A DEGRADED source (the transcript lookup failed, so the context fell back
 * to the material text) is not a changed source: with a row stored it is
 * returned unchanged — no model call, no carry-over — or the lesson would
 * regenerate now and again when the provider recovers, resetting unpassed
 * pilots' uncleared chunks each time. Only with no row at all does a
 * degraded source generate.
 *
 * When another caller holds the regeneration claim and nothing is stored
 * yet, it polls for their result for up to `CHUNKS_BUSY_WAIT_MS`, then
 * answers `busy`.
 */
export async function ensureLessonChunks(
  lessonId: number,
  lessonSlug: string,
  courseId: number,
): Promise<EnsuredChunks> {
  const source = await resolveDebriefSource(lessonSlug, courseId);
  if (!source) return { kind: 'no-source' };
  const { lessonVersionId } = source;
  const fingerprint = chunkFingerprint(source);

  const current = await selectLessonChunks(lessonVersionId);
  if (
    current &&
    (source.degraded || current.sourceFingerprint === fingerprint)
  ) {
    return ready(current, source);
  }

  const claimed = await redis.set(claimKey(lessonVersionId), '1', {
    nx: true,
    ex: CLAIM_TTL_SECONDS,
  });
  if (claimed !== 'OK') {
    if (current) return ready(current, source);
    // The holder is writing the FIRST list: wait for it rather than calling
    // the lesson empty.
    for (let waited = 0; waited < CHUNKS_BUSY_WAIT_MS; ) {
      await sleep(CHUNKS_BUSY_POLL_MS);
      waited += CHUNKS_BUSY_POLL_MS;
      const landed = await selectLessonChunks(lessonVersionId);
      if (landed) return ready(landed, source);
    }
    return { kind: 'busy' };
  }

  try {
    // Re-read: the previous holder may have just finished.
    const latest = await selectLessonChunks(lessonVersionId);
    if (latest?.sourceFingerprint === fingerprint) {
      return ready(latest, source);
    }

    const generated = await generateKnowledgeChunks({
      keyPoints: source.keyPoints,
      context: source.context,
    });
    if (generated.length === 0) return { kind: 'no-source' };

    // Matched before they are numbered: the number is taken under a lock on
    // the lesson, which a model call must not hold.
    const matches = latest
      ? await matchKnowledgeChunks(latest.chunks, generated)
      : null;

    // One transaction: a crash can never leave the new fingerprint stored
    // with the carry-over undone (nothing would ever retry it).
    const stored = await db.transaction(async (tx) => {
      const version = await nextChunkVersion(lessonId, tx);
      const numbered = (id: string) => `v${version}-${id}`;
      const chunks = generated.map((c) => ({ ...c, id: numbered(c.id) }));
      const mapping =
        matches &&
        Object.fromEntries(
          Object.entries(matches).map(([was, now]) => [
            was,
            now === null ? null : numbered(now),
          ]),
        );
      await upsertLessonChunks(
        {
          lessonId,
          lessonVersionId,
          version,
          sourceFingerprint: fingerprint,
          chunks,
          previousMapping: mapping,
        },
        tx,
      );
      if (latest && mapping) {
        await carryOverMastery(lessonId, mapping, latest.version, tx);
      }
      return { version, chunks };
    });
    return ready(stored, source);
  } finally {
    await redis.del(claimKey(lessonVersionId));
  }
}

/**
 * After the list numbered `previousVersion` is replaced: for every pilot
 * WITHOUT a permanent pass, keep their cleared chunks that map to a new id
 * (with `clearedAt` and `latestScore`) and drop the rest of their rows of that
 * list. Rows of any other list are never touched: the new one, and those of
 * the lesson's other snapshots, which a learner of another course may be on.
 * Delete-then-insert, never in-place id updates: a swap (c1->c2, c2->c1) would
 * break the unique key. When the new id already has a row, it is kept and just
 * ensured cleared.
 *
 * Never records a pass: since 2026-11-18 a debrief is passed only by a set of
 * answers (`#/lib/debrief-sets`), so carried mastery only orders the next
 * draw (`drawAttemptKeyPoints`).
 *
 * Pass `ex` to run inside the caller's transaction; otherwise opens its own.
 */
export async function carryOverMastery(
  lessonId: number,
  mapping: Record<string, string | null>,
  previousVersion: number,
  ex?: Executor,
): Promise<void> {
  const run = async (tx: Executor) => {
    const rows = await selectStaleMastery(tx, lessonId, previousVersion);
    await deleteStaleMastery(tx, lessonId, previousVersion);

    const carried = new Map<
      string,
      {
        userId: string;
        lessonId: number;
        chunkId: string;
        latestScore: number;
        clearedAt: Date;
      }
    >();
    for (const r of rows) {
      const chunkId = r.clearedAt ? mapping[r.chunkId] : null;
      if (!chunkId || !r.clearedAt) continue;
      const key = `${r.userId}\u0000${chunkId}`;
      if (carried.has(key)) continue;
      carried.set(key, {
        userId: r.userId,
        lessonId,
        chunkId,
        latestScore: r.latestScore,
        clearedAt: r.clearedAt,
      });
    }
    if (carried.size === 0) return;
    await insertCarriedMastery(tx, [...carried.values()]);
  };
  if (ex) await run(ex);
  else await db.transaction(async (tx) => run(tx));
}
