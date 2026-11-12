import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import type { AITestFreeTextQuestion } from '../schemas';
import { chunkBlock } from './chunks';

export function evaluatorPrompt(vars: {
  chunks: KnowledgeChunk[];
  text: string;
  questions: AITestFreeTextQuestion[];
}): string {
  const { chunks, text, questions } = vars;

  return `You are a senior aviation training quality assessor. Evaluate each debrief question (answered in the pilot's own words) against the criteria below and return a structured quality report.

## Evaluation Criteria

For each question, assess ALL of the following:

1. **Indirectness** — The question must NOT directly quote or paraphrase the chunk's title or summary. It should test understanding through scenario or application, not recall of the wording.
2. **Accuracy** — The expected answer must be factually correct according to the lesson text.
3. **Depth** — The question must invite explanation or reasoning; fail it if a single word or a yes/no answers it.
4. **Clarity** — The question must be unambiguous. A competent student should not be confused about what is being asked.
5. **Coverage** — The question must genuinely test its focus chunk, the FIRST id in its \`chunkIds\`.

## Output Format

Return a result for every question:
- \`questionId\`: the question's ID string
- \`pass\`: \`true\` if ALL criteria are met, \`false\` if any criterion fails
- \`reason\`: a brief explanation (1–2 sentences) of why it passed or which specific criterion failed and how

Also return \`allPassed: true\` only if every single question passes.

## Knowledge Chunks
${chunkBlock(chunks)}

## Lesson Text
${text}

## Questions to Evaluate
\`\`\`json
${JSON.stringify(questions, null, 2)}
\`\`\``;
}
