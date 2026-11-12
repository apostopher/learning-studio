import { generateText, Output } from 'ai';
import { z } from 'zod';
import { buildKnowledgeChunksPrompt } from '#/ai/prompts/knowledge-chunks';
import {
  type KnowledgeChunk,
  MAX_KNOWLEDGE_CHUNKS,
} from '#/lib/debrief-mastery';
import { sonnet } from './ai-provider';

const ChunksOutputSchema = z.object({
  chunks: z
    .array(z.object({ title: z.string().min(1), summary: z.string().min(1) }))
    .min(1)
    .max(MAX_KNOWLEDGE_CHUNKS),
});

/**
 * The lesson's knowledge chunks: one per key point plus anything the context
 * teaches beyond them, capped at MAX_KNOWLEDGE_CHUNKS.
 *
 * Ids are `c1..cN` assigned HERE, never by the model — the model's ordering is
 * the only thing trusted. A schema failure (e.g. 9 chunks) is retried once,
 * then thrown: a debrief with a wrong chunk set is worse than none.
 */
export async function generateKnowledgeChunks(input: {
  keyPoints: string[];
  context: string;
}): Promise<KnowledgeChunk[]> {
  const prompt = buildKnowledgeChunksPrompt(input);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: sonnet,
        output: Output.object({ schema: ChunksOutputSchema }),
        prompt,
      });
      const parsed = ChunksOutputSchema.parse(output);
      return parsed.chunks.map((c, i) => ({
        id: `c${i + 1}`,
        title: c.title.trim(),
        summary: c.summary.trim(),
      }));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
