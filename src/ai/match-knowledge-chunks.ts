import { generateText, Output } from 'ai';
import { z } from 'zod';
import { buildMatchKnowledgeChunksPrompt } from '#/ai/prompts/knowledge-chunks';
import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import { haiku } from './ai-provider';

const MatchOutputSchema = z.object({
  matches: z.array(
    z.object({ oldId: z.string(), newId: z.string().nullable() }),
  ),
});

/**
 * Maps each old chunk id to the new chunk id with the same meaning, or null.
 *
 * The model is only asked; the invariants are enforced here: unknown new ids
 * become null, omitted old ids become null, and at most one old id may claim a
 * new id — on a duplicate the first wins and the rest are nulled, so one
 * pilot's mastery of an old chunk can never be copied onto the same new chunk
 * twice.
 */
export async function matchKnowledgeChunks(
  oldChunks: KnowledgeChunk[],
  newChunks: KnowledgeChunk[],
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = Object.fromEntries(
    oldChunks.map((c) => [c.id, null]),
  );
  if (oldChunks.length === 0 || newChunks.length === 0) return result;

  const { output } = await generateText({
    model: haiku,
    output: Output.object({ schema: MatchOutputSchema }),
    prompt: buildMatchKnowledgeChunksPrompt({ oldChunks, newChunks }),
  });

  const newIds = new Set(newChunks.map((c) => c.id));
  const claimed = new Set<string>();
  for (const { oldId, newId } of output.matches) {
    if (!(oldId in result) || result[oldId] !== null) continue;
    if (newId === null || !newIds.has(newId) || claimed.has(newId)) continue;
    claimed.add(newId);
    result[oldId] = newId;
  }
  return result;
}
