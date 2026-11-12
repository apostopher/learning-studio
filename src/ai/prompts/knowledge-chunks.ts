import { MAX_KNOWLEDGE_CHUNKS } from '#/lib/debrief-mastery';

/** Transcripts run long; this is comfortably more than a 30-minute lesson. */
const MAX_CONTEXT_CHARS = 60_000;

/**
 * Chunk-generation prompt. One chunk per key point is the anchor (so authored
 * lessons keep their shape); teaching that only the transcript covers adds
 * chunks; anything beyond the cap is merged, least important first.
 */
export function buildKnowledgeChunksPrompt(input: {
  keyPoints: string[];
  context: string;
}): string {
  const points = input.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');
  return `You are an aviation training editor. Break one lesson into "knowledge chunks": the discrete ideas a pilot must hold in their head after the lesson, each one something a debrief can test on its own.

## Key points (authoritative — verbatim)
${points}

## Lesson context (transcript or material)
${input.context.slice(0, MAX_CONTEXT_CHARS)}

Rules:
- Produce exactly one chunk per key point above, in the same order. Each chunk is anchored on its key point.
- If the context teaches something important that no key point covers, add a chunk for it after the anchored ones.
- Never produce more than ${MAX_KNOWLEDGE_CHUNKS} chunks. If you would exceed that, merge the least important chunks into related ones.
- "title" is a short noun phrase (under 8 words). "summary" is one or two self-contained sentences stating the fact or procedure, in the instructor's terminology.
- Do not include greetings, course admin, or references to other lessons.`;
}

export function buildMatchKnowledgeChunksPrompt(input: {
  oldChunks: { id: string; title: string; summary: string }[];
  newChunks: { id: string; title: string; summary: string }[];
}): string {
  const fmt = (cs: typeof input.oldChunks) =>
    cs.map((c) => `- ${c.id}: ${c.title} — ${c.summary}`).join('\n');
  return `A lesson's knowledge chunks were regenerated. For every OLD chunk, find the NEW chunk that teaches the same idea (same meaning, even if reworded), or null if no new chunk does. Each new chunk may be matched by at most one old chunk. Be strict: a new chunk that only overlaps partially is not a match.

## Old chunks
${fmt(input.oldChunks)}

## New chunks
${fmt(input.newChunks)}

Return one entry per old chunk.`;
}
