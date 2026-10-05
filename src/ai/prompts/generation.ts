export function generationPrompt(vars: {
  keyPoints: string[];
  text: string;
  questionCount: number;
  mcqCount: number;
  freeTextCount: number;
}): string {
  const { keyPoints, text, questionCount, mcqCount, freeTextCount } = vars;

  const numberedKeyPoints = keyPoints.map((kp, i) => `${i}. ${kp}`).join('\n');

  return `You are an expert aviation knowledge assessment designer. Your task is to generate quiz questions for aviation training material.

## Instructions

Generate exactly ${questionCount} questions: ${mcqCount} multiple-choice (MCQ) and ${freeTextCount} free-text questions.

### Distribution
- Aim for 2 questions per key point (1 MCQ + 1 free-text where possible)
- Each question must include a \`keyPointIndex\` (0-based) referencing the key point it tests

### Critical Rules
- NEVER directly quote or reference the key point text in the question
- Questions must be scenario-based or application-focused — test understanding, not recall
- Draw on the lesson text for realistic context and details

### MCQ Requirements
- Exactly 4 answer options
- All distractors must be plausible but clearly distinguishable from the correct answer
- Avoid "all of the above" / "none of the above" options
- The correct option must NOT stand out from the distractors. A learner who does not know the material should not be able to guess it from its form:
  - Write all four options at the same length and level of detail — the correct answer must not be the longest or most qualified option. Give distractors the same specifics (numbers, conditions, procedures) the correct answer has
  - Match grammar and structure across options, so no option is the only one that fits the question's wording
  - Do not let only the correct option echo key words from the question, or only the distractors use absolutes ("always", "never")
- Option order does not matter — options are reordered after generation

### Free-text Requirements
- Include a concise \`expectedAnswer\` (1–3 sentences) as a reference for grading
- Questions should invite explanation or reasoning, not one-word answers

### Format & IDs
- Generate unique string IDs: questions use \`"q1"\`, \`"q2"\`, etc.; MCQ options use \`"q1a"\`, \`"q1b"\`, \`"q1c"\`, \`"q1d"\`
- Interleave question types — do NOT group all MCQs together then all free-text
- Question text should be written in markdown

## Key Points
${numberedKeyPoints}

## Lesson Text
${text}`;
}
