export function generationPrompt(vars: {
  keyPoints: string[];
  text: string;
  questionCount: number;
  setSize: number;
}): string {
  const { keyPoints, text, questionCount, setSize } = vars;

  const numberedKeyPoints = keyPoints.map((kp, i) => `${i}. ${kp}`).join('\n');

  return `You are an expert aviation knowledge assessment designer. Your task is to write debrief questions for aviation training material. A pilot answers each one in their own words.

## Instructions

Generate exactly ${questionCount} free-text questions, in order, as two sets of ${setSize}.

### The two sets
- Questions 1–${setSize} are the first set. Each tests a different key point, and together they cover the most important ideas of the lesson.
- Questions ${setSize + 1}–${questionCount} are the second set, asked only to a pilot whose answers to the first set fell short. Test the same core ideas again from a different angle or scenario, or the key points the first set left out. Never reword a first-set question.
- Each question must include a \`keyPointIndex\` (0-based) referencing the key point it tests

### Critical Rules
- NEVER directly quote or reference the key point text in the question
- Questions must be scenario-based or application-focused — test understanding, not recall
- Draw on the lesson text for realistic context and details
- Questions should invite explanation or reasoning, not one-word answers
- Include a concise \`expectedAnswer\` (1–3 sentences) as a reference for grading

### Format & IDs
- Generate unique string IDs: \`"q1"\`, \`"q2"\`, etc., in the order above
- Question text should be written in markdown

## Key Points
${numberedKeyPoints}

## Lesson Text
${text}`;
}
