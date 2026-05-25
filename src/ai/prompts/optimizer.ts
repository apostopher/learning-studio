import type { AITestQuestion } from "../schemas";
import type { EvaluatorOutput } from "../schemas";

export function optimizerPrompt(vars: {
  keyPoints: string[];
  text: string;
  failedQuestions: AITestQuestion[];
  evaluatorFeedback: EvaluatorOutput["results"];
}): string {
  const { keyPoints, text, failedQuestions, evaluatorFeedback } = vars;

  const numberedKeyPoints = keyPoints
    .map((kp, i) => `${i}. ${kp}`)
    .join("\n");

  // Pair each failed question with its evaluator feedback
  const pairedItems = failedQuestions.map((q) => {
    const feedback = evaluatorFeedback.find((f) => f.questionId === q.id);
    return {
      question: q,
      feedback: feedback ?? { questionId: q.id, pass: false, reason: "No feedback available" },
    };
  });

  return `You are an expert aviation training question writer. Some quiz questions failed a quality review. Your task is to regenerate ONLY those failed questions, fixing the specific issues identified.

## Rules

- Regenerate ONLY the questions listed below — do not modify passing questions
- Keep the same \`type\` (mcq / free-text) and \`keyPointIndex\` as the original
- Generate NEW unique IDs — do NOT reuse the original question IDs (e.g. if original was \`"q2"\`, use \`"q2r"\` or a fresh identifier)
- Directly address the evaluator's stated reason for failure
- Follow all original generation rules:
  - NEVER directly quote or reference the key point text
  - Scenario-based, application-focused questions
  - MCQ: exactly 4 plausible but distinguishable options
  - Free-text: concise \`expectedAnswer\` (1–3 sentences)
  - Question text in markdown

## Key Points
${numberedKeyPoints}

## Lesson Text
${text}

## Failed Questions with Evaluator Feedback

${pairedItems
  .map(
    ({ question, feedback }) => `### Question ID: ${question.id}
**Evaluator Feedback:** ${feedback.reason}

**Original Question:**
\`\`\`json
${JSON.stringify(question, null, 2)}
\`\`\``,
  )
  .join("\n\n")}`;
}
