import { createHash } from 'node:crypto';
import { generateKnowledgeChunks } from '#/ai/generate-knowledge-chunks';
import { matchKnowledgeChunks } from '#/ai/match-knowledge-chunks';
import { db } from '#/db';
import {
  deleteStaleMastery,
  type Executor,
  insertCarriedMastery,
  selectLessonChunks,
  selectStaleMastery,
  upsertLessonChunks,
} from '#/db/knowledge-chunks';
import { redis } from '#/integrations/upstash/redis';
import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import { resolveDebriefSource } from '#/lib/lesson-debrief-source.server';

/** Bump with any change a stored chunk list must not outlive. */
const CHUNKS_FORMAT = 'knowledge-chunks-v1';
const CLAIM_TTL_SECONDS = 60 * 5;

const claimKey = (lessonId: number) => `knowledge-chunks:claim:${lessonId}`;

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
 * Re-key scores recorded against chunk ids of the current or the previous
 * version onto the current ids. Current ids pass through, one-version-old ids
 * go through `mapping`, anything unmapped or older is dropped.
 */
export function mapToCurrentChunkIds(
  scores: Record<string, number>,
  mapping: Record<string, string | null> | null,
  currentVersion: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, score] of Object.entries(scores)) {
    const v = chunkIdVersion(id);
    if (v === currentVersion) {
      out[id] = score;
    } else if (v === currentVersion - 1) {
      const next = mapping?.[id];
      if (next) out[next] = score;
    }
  }
  return out;
}

/**
 * What `ensureLessonChunks` found:
 * - `ready`: the current chunks, plus the context they were resolved
 *   alongside — what question generation reads next, returned so a caller
 *   does not resolve the source (a transcript fetch) a second time;
 * - `no-source`: there is nothing to debrief from (no source, or generation
 *   produced no chunks);
 * - `busy`: another request is generating this lesson's FIRST chunk list and
 *   it did not land within `CHUNKS_BUSY_WAIT_MS`. Retry shortly — this is not
 *   "nothing to debrief".
 */
export type EnsuredChunks =
  | {
      kind: 'ready';
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
  context: string,
): EnsuredChunks => ({
  kind: 'ready',
  version: row.version,
  chunks: row.chunks,
  context,
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The lesson's current knowledge chunks, generating them when missing or when
 * the source changed. Stored ids are version-scoped (`v2-c3`).
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
  const fingerprint = chunkFingerprint(source);

  const current = await selectLessonChunks(lessonId);
  if (
    current &&
    (source.degraded || current.sourceFingerprint === fingerprint)
  ) {
    return ready(current, source.context);
  }

  const claimed = await redis.set(claimKey(lessonId), '1', {
    nx: true,
    ex: CLAIM_TTL_SECONDS,
  });
  if (claimed !== 'OK') {
    if (current) return ready(current, source.context);
    // The holder is writing the FIRST list: wait for it rather than calling
    // the lesson empty.
    for (let waited = 0; waited < CHUNKS_BUSY_WAIT_MS; ) {
      await sleep(CHUNKS_BUSY_POLL_MS);
      waited += CHUNKS_BUSY_POLL_MS;
      const landed = await selectLessonChunks(lessonId);
      if (landed) return ready(landed, source.context);
    }
    return { kind: 'busy' };
  }

  try {
    // Re-read: the previous holder may have just finished.
    const latest = await selectLessonChunks(lessonId);
    if (latest?.sourceFingerprint === fingerprint) {
      return ready(latest, source.context);
    }

    const generated = await generateKnowledgeChunks({
      keyPoints: source.keyPoints,
      context: source.context,
    });
    if (generated.length === 0) return { kind: 'no-source' };

    const version = (latest?.version ?? 0) + 1;
    const chunks = generated.map((c) => ({ ...c, id: `v${version}-${c.id}` }));
    const mapping = latest
      ? await matchKnowledgeChunks(latest.chunks, chunks)
      : null;

    // One transaction: a crash can never leave the new fingerprint stored
    // with the carry-over undone (nothing would ever retry it).
    await db.transaction(async (tx) => {
      await upsertLessonChunks(
        {
          lessonId,
          version,
          sourceFingerprint: fingerprint,
          chunks,
          previousMapping: mapping,
        },
        tx,
      );
      if (mapping) await carryOverMastery(lessonId, mapping, version, tx);
    });
    return { kind: 'ready', version, chunks, context: source.context };
  } finally {
    await redis.del(claimKey(lessonId));
  }
}

/**
 * After a regeneration to `newVersion`: for every pilot WITHOUT a permanent
 * pass, keep their cleared chunks that map to a new id (with `clearedAt` and
 * `latestScore`) and drop the rest of their OLD-version rows. Rows already at
 * `newVersion` are never touched. Delete-then-insert, never in-place id
 * updates: a swap (c1->c2, c2->c1) would break the unique key. When the new id
 * already has a row, it is kept and just ensured cleared.
 *
 * Pass `ex` to run inside the caller's transaction; otherwise opens its own.
 */
export async function carryOverMastery(
  lessonId: number,
  mapping: Record<string, string | null>,
  newVersion: number,
  ex?: Executor,
): Promise<void> {
  const run = async (tx: Executor) => {
    const rows = await selectStaleMastery(tx, lessonId, newVersion);
    await deleteStaleMastery(tx, lessonId, newVersion);

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
    if (carried.size > 0) await insertCarriedMastery(tx, [...carried.values()]);
  };
  if (ex) await run(ex);
  else await db.transaction(async (tx) => run(tx));
}
