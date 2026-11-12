import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import { chunkBlock } from './chunks';

export type QuestionSlot = { chunkId: string; kind: 'hole' | 'review' };

export function generationPrompt(vars: {
  chunks: KnowledgeChunk[];
  slots: QuestionSlot[];
  text: string;
  avoidQuestions: string[];
}): string {
  const { chunks, slots, text, avoidQuestions } = vars;

  const slotList = slots
    .map(
      (s, i) =>
        `${i + 1}. focus chunk \`${s.chunkId}\` (${
          s.kind === 'hole'
            ? 'the pilot has not yet shown they know this'
            : 'spaced review of something the pilot already cleared'
        })`,
    )
    .join('\n');

  const avoid =
    avoidQuestions.length === 0
      ? ''
      : `

## Questions this pilot has already been asked
Never reuse or reword any of these. Test the same chunk from a different angle or scenario.
${avoidQuestions.map((q) => `- ${q}`).join('\n')}`;

  return `You are an expert aviation knowledge assessment designer. Your task is to write debrief questions for aviation training material. A pilot answers each one in their own words.

## Instructions

Generate exactly ${slots.length} free-text questions, in exactly this order, one per slot:
${slotList}

- Each question must set \`chunkIds\` with the slot's focus chunk id FIRST. You may add ONE second chunk id only if the question genuinely also leans on it.
- Use only chunk ids listed below, exactly as written.

### Critical Rules
- NEVER directly quote the chunk title or summary in the question
- Questions must be scenario-based or application-focused — test understanding, not recall
- Draw on the lesson text for realistic context and details
- Questions should invite explanation or reasoning, not one-word answers
- Include a concise \`expectedAnswer\` (1–3 sentences) as a reference for grading

### Format & IDs
- Generate unique string IDs: \`"q1"\`, \`"q2"\`, etc., in the order above
- Question text should be written in markdown

## Knowledge Chunks
${chunkBlock(chunks)}${avoid}

## Lesson Text
${text}`;
}
