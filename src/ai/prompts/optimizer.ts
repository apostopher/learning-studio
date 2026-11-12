import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import type { AITestFreeTextQuestion, EvaluatorOutput } from '../schemas';
import { chunkBlock } from './chunks';

export function optimizerPrompt(vars: {
  chunks: KnowledgeChunk[];
  /** Slot focus chunk id for each failed question, by question id. */
  focusByQuestionId: Record<string, string>;
  text: string;
  failedQuestions: AITestFreeTextQuestion[];
  evaluatorFeedback: EvaluatorOutput['results'];
}): string {
  const {
    chunks,
    focusByQuestionId,
    text,
    failedQuestions,
    evaluatorFeedback,
  } = vars;

  // Pair each failed question with its evaluator feedback
  const pairedItems = failedQuestions.map((q) => {
    const feedback = evaluatorFeedback.find((f) => f.questionId === q.id);
    return {
      question: q,
      feedback: feedback ?? {
        questionId: q.id,
        pass: false,
        reason: 'No feedback available',
      },
    };
  });

  return `You are an expert aviation training question writer. Some debrief questions failed a quality review. Your task is to regenerate ONLY those failed questions, fixing the specific issues identified.

## Rules

- Regenerate ONLY the questions listed below — do not modify passing questions
- Keep the same \`type\` (free-text), and return them in the order listed. Each one's \`chunkIds\` must start with the focus chunk id given for it (you may add one second id) and use only ids from the Knowledge Chunks list
- Give each a fresh ID of your choice (it is reassigned afterwards)
- Directly address the evaluator's stated reason for failure
- Follow all original generation rules:
  - NEVER directly quote or reference the chunk title or summary
  - Scenario-based, application-focused questions
  - Invite explanation or reasoning, not one-word answers
  - A concise \`expectedAnswer\` (1–3 sentences)
  - Question text in markdown

## Knowledge Chunks
${chunkBlock(chunks)}

## Lesson Text
${text}

## Failed Questions with Evaluator Feedback

${pairedItems
  .map(
    ({ question, feedback }) => `### Question ID: ${question.id}
**Focus chunk (first of chunkIds):** \`${focusByQuestionId[question.id] ?? question.chunkIds[0]}\`
**Evaluator Feedback:** ${feedback.reason}

**Original Question:**
\`\`\`json
${JSON.stringify(question, null, 2)}
\`\`\``,
  )
  .join('\n\n')}`;
}
