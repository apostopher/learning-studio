import { createHash } from 'node:crypto';
import { generateKnowledgeChunks } from '#/ai/generate-knowledge-chunks';
import { matchKnowledgeChunks } from '#/ai/match-knowledge-chunks';
import { db } from '#/db';
import {
  selectLessonChunks,
  unpassedMasteryRows,
  upsertLessonChunks,
} from '#/db/knowledge-chunks';
import { debriefChunkMasteryTable } from '#/db/schema';
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

type Stored = { version: number; chunks: KnowledgeChunk[] };

const toStored = (
  row: { version: number; chunks: KnowledgeChunk[] } | null,
): Stored | null => (row ? { version: row.version, chunks: row.chunks } : null);

/**
 * The lesson's current knowledge chunks, generating them when missing or when
 * the source changed. Stored ids are version-scoped (`v2-c3`). Null when there
 * is no source or nothing could be generated, and when another caller holds
 * the regeneration claim and nothing is stored yet.
 */
export async function ensureLessonChunks(
  lessonId: number,
  lessonSlug: string,
  courseId: number,
): Promise<Stored | null> {
  const source = await resolveDebriefSource(lessonSlug, courseId);
  if (!source) return null;
  const fingerprint = chunkFingerprint(source);

  const current = await selectLessonChunks(lessonId);
  if (current?.sourceFingerprint === fingerprint) return toStored(current);

  const claimed = await redis.set(claimKey(lessonId), '1', {
    nx: true,
    ex: CLAIM_TTL_SECONDS,
  });
  if (claimed !== 'OK') return toStored(current);

  try {
    // Re-read: the previous holder may have just finished.
    const latest = await selectLessonChunks(lessonId);
    if (latest?.sourceFingerprint === fingerprint) return toStored(latest);

    const generated = await generateKnowledgeChunks({
      keyPoints: source.keyPoints,
      context: source.context,
    });
    if (generated.length === 0) return null;

    const version = (latest?.version ?? 0) + 1;
    const chunks = generated.map((c) => ({ ...c, id: `v${version}-${c.id}` }));
    const mapping = latest
      ? await matchKnowledgeChunks(latest.chunks, chunks)
      : null;

    await upsertLessonChunks({
      lessonId,
      version,
      sourceFingerprint: fingerprint,
      chunks,
      previousMapping: mapping,
    });
    if (mapping) await carryOverMastery(lessonId, mapping);
    return { version, chunks };
  } finally {
    await redis.del(claimKey(lessonId));
  }
}

/**
 * After a regeneration: for every pilot WITHOUT a permanent pass, keep their
 * cleared chunks that map to a new id (with `clearedAt` and `latestScore`) and
 * drop everything else. Done as delete-then-insert in one transaction, never
 * in-place id updates: a swap (c1->c2, c2->c1) would break the unique key.
 */
export async function carryOverMastery(
  lessonId: number,
  mapping: Record<string, string | null>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(debriefChunkMasteryTable)
      .where(unpassedMasteryRows(lessonId));
    await tx
      .delete(debriefChunkMasteryTable)
      .where(unpassedMasteryRows(lessonId));

    const carried = rows.flatMap((r) => {
      const chunkId = r.clearedAt ? mapping[r.chunkId] : null;
      return chunkId && r.clearedAt
        ? [
            {
              userId: r.userId,
              lessonId,
              chunkId,
              latestScore: r.latestScore,
              clearedAt: r.clearedAt,
            },
          ]
        : [];
    });
    if (carried.length > 0) {
      await tx.insert(debriefChunkMasteryTable).values(carried);
    }
  });
}
