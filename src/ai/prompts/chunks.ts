import type { KnowledgeChunk } from '#/lib/debrief-mastery';

/** A chunk as the prompts show it: opaque id, title, one-line summary. */
export function chunkBlock(chunks: KnowledgeChunk[]): string {
  return chunks
    .map((c) => `- \`${c.id}\` — **${c.title}**: ${c.summary}`)
    .join('\n');
}
