export function evaluationPrompt(vars: {
  question: string;
  expectedAnswer: string;
  userAnswer: string;
  keyPoints: string[];
  text: string;
}): string {
  const { question, expectedAnswer, userAnswer, keyPoints, text } = vars;

  const numberedKeyPoints = keyPoints
    .map((kp, i) => `${i}. ${kp}`)
    .join("\n");

  return `You are an expert aviation instructor grading a student's written response.

## Scoring Rubric

Score the student's answer from 0 to 100 using these bands:

| Score | Meaning |
|-------|---------|
| 0     | Incorrect or completely off-topic |
| 25    | Shows some awareness of the topic but misses key concepts |
| 50    | Partially correct — addresses the question but omits important details |
| 75    | Mostly correct — minor gaps or imprecision |
| 100   | Fully correct and complete |

## Instructions

- Compare the student's answer against the expected answer and lesson text
- Award partial credit where the student demonstrates genuine understanding
- Provide a brief explanation (2–3 sentences) noting:
  - What the student got right
  - What was missing or incorrect
- Be encouraging but accurate — do not inflate scores

## Question
${question}

## Expected Answer
${expectedAnswer}

## Student's Answer
${userAnswer}

## Key Points
${numberedKeyPoints}

## Lesson Text
${text}`;
}
