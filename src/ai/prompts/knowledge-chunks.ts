/** Transcripts run long; this is comfortably more than a 30-minute lesson. */
const MAX_CONTEXT_CHARS = 60_000;

/**
 * Chunk-generation prompt. Exactly one chunk per key point, never merged or
 * dropped: the debrief asks about key points only (2026-11-18). The context
 * informs each chunk's summary; it never adds chunks of its own.
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
- Never merge, drop or combine key points: each one gets its own chunk, about that key point only.
- Produce no other chunks: nothing the context teaches beyond the key points gets a chunk of its own. Use the context only to make each key point's summary accurate and complete.
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
