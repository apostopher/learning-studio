# AI Test Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two AI pipelines — an evaluator-optimizer loop that generates quiz questions from lesson keypoints/text, and a simple evaluator that grades user answers.

**Architecture:** Server-side AI module using Vercel AI SDK `generateObject` with Zod schemas. Sonnet generates/optimizes questions and grades answers; Haiku evaluates question quality. TanStack Start server handlers expose 4 REST endpoints. Jotai atoms + TanStack Query mutations on the client.

**Tech Stack:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), Zod 4, Drizzle ORM, TanStack Start server handlers, Jotai + jotai-tanstack-query, Vitest

---

## File Map

```
CREATE src/ai/ai-provider.ts          — Anthropic SDK setup, exports sonnet + haiku models
CREATE src/ai/schemas.ts              — Zod schemas: AITestQuestion, AITest, EvaluatorOutput, AIEvaluationResult
CREATE src/ai/prompts/generation.ts   — Question generation prompt template
CREATE src/ai/prompts/evaluator.ts    — Question quality evaluation prompt template
CREATE src/ai/prompts/optimizer.ts    — Failed-question regeneration prompt template
CREATE src/ai/prompts/evaluation.ts   — Answer grading prompt template
CREATE src/ai/generate-test.ts        — Evaluator-optimizer loop orchestrator
CREATE src/ai/evaluate-answer.ts      — Single-call answer grading (MCQ + free-text)
MODIFY src/db/schema.ts               — Add lessonTestResultsTable + relations
CREATE src/db/lesson-test.ts          — saveTestResult(), getTestResults() queries
CREATE src/routes/api/lesson/ai-test/generate.ts    — POST: generate test
CREATE src/routes/api/lesson/ai-test/evaluate.ts    — POST: evaluate one answer
CREATE src/routes/api/lesson/ai-test/save-results.ts — POST: persist results
CREATE src/routes/api/lesson/ai-test/results.ts     — GET: fetch past results
MODIFY src/hooks/data/keys.ts         — Add aiTest query keys
CREATE src/atoms/lesson-ai-test.ts    — Client state atoms for test flow
CREATE src/hooks/data/use-lesson-ai-test.ts — Jotai atom families for mutations + queries
CREATE src/ai/__tests__/schemas.test.ts          — Schema validation tests
CREATE src/ai/__tests__/evaluate-answer.test.ts  — MCQ evaluation unit tests
```

---

### Task 1: Install `@ai-sdk/anthropic`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
pnpm add @ai-sdk/anthropic
```

- [ ] **Step 2: Verify installation**

```bash
pnpm ls @ai-sdk/anthropic
```

Expected: `@ai-sdk/anthropic` appears in the output with a version number.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @ai-sdk/anthropic for AI test pipeline"
```

---

### Task 2: Zod Schemas

**Files:**
- Create: `src/ai/schemas.ts`
- Test: `src/ai/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the schema validation tests**

Create `src/ai/__tests__/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AITestMCQQuestionSchema,
  AITestFreeTextQuestionSchema,
  AITestQuestionSchema,
  AITestGenerationOutputSchema,
  EvaluatorOutputSchema,
  AIEvaluationResultSchema,
  AIFreeTextEvalOutputSchema,
} from "../schemas";

describe("AITestMCQQuestionSchema", () => {
  it("accepts a valid MCQ question", () => {
    const result = AITestMCQQuestionSchema.safeParse({
      id: "q1",
      type: "mcq",
      question: "What happens when...?",
      options: [
        { id: "a", value: "Option A" },
        { id: "b", value: "Option B" },
        { id: "c", value: "Option C" },
        { id: "d", value: "Option D" },
      ],
      correctOptionId: "b",
      keyPointIndex: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects MCQ with fewer than 4 options", () => {
    const result = AITestMCQQuestionSchema.safeParse({
      id: "q1",
      type: "mcq",
      question: "What happens?",
      options: [
        { id: "a", value: "Option A" },
        { id: "b", value: "Option B" },
      ],
      correctOptionId: "a",
      keyPointIndex: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("AITestFreeTextQuestionSchema", () => {
  it("accepts a valid free-text question", () => {
    const result = AITestFreeTextQuestionSchema.safeParse({
      id: "q2",
      type: "free-text",
      question: "Explain why...",
      expectedAnswer: "Because of X and Y.",
      keyPointIndex: 1,
    });
    expect(result.success).toBe(true);
  });
});

describe("AITestQuestionSchema (discriminated union)", () => {
  it("discriminates MCQ from free-text", () => {
    const mcq = AITestQuestionSchema.parse({
      id: "q1",
      type: "mcq",
      question: "Which?",
      options: [
        { id: "a", value: "A" },
        { id: "b", value: "B" },
        { id: "c", value: "C" },
        { id: "d", value: "D" },
      ],
      correctOptionId: "a",
      keyPointIndex: 0,
    });
    expect(mcq.type).toBe("mcq");

    const freeText = AITestQuestionSchema.parse({
      id: "q2",
      type: "free-text",
      question: "Why?",
      expectedAnswer: "Because...",
      keyPointIndex: 1,
    });
    expect(freeText.type).toBe("free-text");
  });
});

describe("AITestGenerationOutputSchema", () => {
  it("accepts an array of mixed questions", () => {
    const result = AITestGenerationOutputSchema.safeParse({
      questions: [
        {
          id: "q1",
          type: "mcq",
          question: "Which?",
          options: [
            { id: "a", value: "A" },
            { id: "b", value: "B" },
            { id: "c", value: "C" },
            { id: "d", value: "D" },
          ],
          correctOptionId: "a",
          keyPointIndex: 0,
        },
        {
          id: "q2",
          type: "free-text",
          question: "Why?",
          expectedAnswer: "Because...",
          keyPointIndex: 0,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("EvaluatorOutputSchema", () => {
  it("accepts a quality evaluation", () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [
        { questionId: "q1", pass: true, reason: "Good indirect question" },
        { questionId: "q2", pass: false, reason: "Directly quotes keypoint" },
      ],
      allPassed: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("AIEvaluationResultSchema", () => {
  it("accepts an MCQ evaluation", () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: "q1",
      type: "mcq",
      score: 100,
      userAnswer: "b",
      explanation: "The correct answer is: Option B",
    });
    expect(result.success).toBe(true);
  });

  it("rejects score above 100", () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: "q1",
      type: "free-text",
      score: 150,
      userAnswer: "some answer",
      explanation: "Good",
    });
    expect(result.success).toBe(false);
  });
});

describe("AIFreeTextEvalOutputSchema", () => {
  it("accepts a valid free-text evaluation output", () => {
    const result = AIFreeTextEvalOutputSchema.safeParse({
      score: 75,
      explanation: "Mostly correct but missed X",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/ai/__tests__/schemas.test.ts
```

Expected: FAIL — cannot resolve `../schemas`.

- [ ] **Step 3: Write the schemas**

Create `src/ai/schemas.ts`:

```ts
import { z } from "zod";

export const AITestOptionSchema = z.object({
  id: z.string(),
  value: z.string(),
});
export type AITestOption = z.infer<typeof AITestOptionSchema>;

export const AITestMCQQuestionSchema = z.object({
  id: z.string(),
  type: z.literal("mcq"),
  question: z.string().describe("Question text in markdown"),
  options: z.array(AITestOptionSchema).length(4),
  correctOptionId: z.string(),
  keyPointIndex: z.number().int().min(0),
});
export type AITestMCQQuestion = z.infer<typeof AITestMCQQuestionSchema>;

export const AITestFreeTextQuestionSchema = z.object({
  id: z.string(),
  type: z.literal("free-text"),
  question: z.string().describe("Question text in markdown"),
  expectedAnswer: z.string().describe("Reference answer for AI grading"),
  keyPointIndex: z.number().int().min(0),
});
export type AITestFreeTextQuestion = z.infer<typeof AITestFreeTextQuestionSchema>;

export const AITestQuestionSchema = z.discriminatedUnion("type", [
  AITestMCQQuestionSchema,
  AITestFreeTextQuestionSchema,
]);
export type AITestQuestion = z.infer<typeof AITestQuestionSchema>;

export const AITestGenerationOutputSchema = z.object({
  questions: z.array(AITestQuestionSchema),
});
export type AITestGenerationOutput = z.infer<typeof AITestGenerationOutputSchema>;

export const AITestSchema = z.object({
  lessonSlug: z.string(),
  questions: z.array(AITestQuestionSchema),
});
export type AITest = z.infer<typeof AITestSchema>;

export const QuestionQualitySchema = z.object({
  questionId: z.string(),
  pass: z.boolean(),
  reason: z.string().describe("Why this question passed or failed quality check"),
});

export const EvaluatorOutputSchema = z.object({
  results: z.array(QuestionQualitySchema),
  allPassed: z.boolean(),
});
export type EvaluatorOutput = z.infer<typeof EvaluatorOutputSchema>;

export const AIFreeTextEvalOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  explanation: z.string(),
});
export type AIFreeTextEvalOutput = z.infer<typeof AIFreeTextEvalOutputSchema>;

export const AIEvaluationResultSchema = z.object({
  questionId: z.string(),
  type: z.enum(["mcq", "free-text"]),
  score: z.number().int().min(0).max(100),
  userAnswer: z.string(),
  explanation: z.string(),
});
export type AIEvaluationResult = z.infer<typeof AIEvaluationResultSchema>;

export const AITestResultSchema = z.object({
  lessonSlug: z.string(),
  test: AITestSchema,
  evaluations: z.array(AIEvaluationResultSchema),
  totalScore: z.number().int().min(0).max(100),
});
export type AITestResult = z.infer<typeof AITestResultSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/ai/__tests__/schemas.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/schemas.ts src/ai/__tests__/schemas.test.ts
git commit -m "feat(ai): add Zod schemas for AI test pipeline"
```

---

### Task 3: AI Provider

**Files:**
- Create: `src/ai/ai-provider.ts`

- [ ] **Step 1: Create the provider module**

Create `src/ai/ai-provider.ts`:

```ts
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY!,
});

export const sonnet = anthropic("claude-sonnet-4-6");

export const haiku = anthropic("claude-haiku-4-5-20251001");
```

- [ ] **Step 2: Commit**

```bash
git add src/ai/ai-provider.ts
git commit -m "feat(ai): add Anthropic SDK provider with sonnet + haiku"
```

---

### Task 4: Prompt Modules

**Files:**
- Create: `src/ai/prompts/generation.ts`
- Create: `src/ai/prompts/evaluator.ts`
- Create: `src/ai/prompts/optimizer.ts`
- Create: `src/ai/prompts/evaluation.ts`

- [ ] **Step 1: Create the generation prompt**

Create `src/ai/prompts/generation.ts`:

```ts
export function generationPrompt(vars: {
  keyPoints: string[];
  text: string;
  questionCount: number;
  mcqCount: number;
  freeTextCount: number;
}): string {
  const keyPointsList = vars.keyPoints
    .map((kp, i) => `${i}. ${kp}`)
    .join("\n");

  return `You are an aviation knowledge assessment expert. Given the lesson material below, create a test of ${vars.questionCount} questions.

RULES:
- ${vars.mcqCount} questions must be multiple choice (type: "mcq") with exactly 4 options each
- ${vars.freeTextCount} questions must be free-text (type: "free-text") requiring 1-3 sentence answers
- There are ${vars.keyPoints.length} key points. Generate 2 questions per key point (1 MCQ + 1 free-text where possible, maintaining the overall ${vars.mcqCount}/${vars.freeTextCount} split)
- Each question tests one key point, indicated by keyPointIndex (0-based index matching the list below)
- NEVER quote or directly reference the key point text in the question
- Instead, create scenario-based or application questions derived from the lesson text that require understanding the concept
- MCQ distractors must be plausible but clearly wrong to someone who understands the material
- Free-text expectedAnswer should be a concise, correct reference answer (1-3 sentences)
- Interleave MCQ and free-text questions throughout the test
- Generate unique string IDs for each question (e.g. "q1", "q2") and each option (e.g. "q1a", "q1b")

KEY POINTS:
${keyPointsList}

LESSON TEXT:
${vars.text}`;
}
```

- [ ] **Step 2: Create the evaluator prompt**

Create `src/ai/prompts/evaluator.ts`:

```ts
import type { AITestQuestion } from "../schemas";

export function evaluatorPrompt(vars: {
  keyPoints: string[];
  text: string;
  questions: AITestQuestion[];
}): string {
  const keyPointsList = vars.keyPoints
    .map((kp, i) => `${i}. ${kp}`)
    .join("\n");

  const questionsJson = JSON.stringify(vars.questions, null, 2);

  return `You are a quality assurance reviewer for aviation knowledge assessments. Evaluate each question against the criteria below.

CRITERIA:
- Indirectness: The question must NOT directly quote or name the key point it tests. It should use a scenario, analogy, or application from the lesson text.
- Accuracy: The correct answer (correctOptionId for MCQ, expectedAnswer for free-text) must actually be correct given the lesson text.
- Plausibility: MCQ distractors must be plausible but distinguishable from the correct answer.
- Clarity: The question must be unambiguous — only one interpretation is reasonable.
- Coverage: The question must actually test understanding of the mapped key point (keyPointIndex).

For each question, output pass: true if ALL criteria are met, or pass: false with a specific reason explaining which criterion failed and why.

Set allPassed to true only if every question passed.

KEY POINTS:
${keyPointsList}

LESSON TEXT:
${vars.text}

QUESTIONS TO EVALUATE:
${questionsJson}`;
}
```

- [ ] **Step 3: Create the optimizer prompt**

Create `src/ai/prompts/optimizer.ts`:

```ts
import type { AITestQuestion } from "../schemas";
import type { EvaluatorOutput } from "../schemas";

export function optimizerPrompt(vars: {
  keyPoints: string[];
  text: string;
  failedQuestions: AITestQuestion[];
  evaluatorFeedback: EvaluatorOutput["results"];
}): string {
  const keyPointsList = vars.keyPoints
    .map((kp, i) => `${i}. ${kp}`)
    .join("\n");

  const failures = vars.failedQuestions.map((q) => {
    const feedback = vars.evaluatorFeedback.find((f) => f.questionId === q.id);
    return {
      question: q,
      feedback: feedback?.reason ?? "No specific feedback",
    };
  });

  return `You are an aviation knowledge assessment expert. Some questions in a test failed quality review. Regenerate ONLY the failed questions, fixing the specific issues noted by the evaluator.

RULES:
- Keep the same question type (mcq or free-text) and keyPointIndex as the original
- Generate new unique IDs for the replacement questions
- Fix the specific issue noted in the evaluator feedback
- Follow the same rules as the original generation: indirect, scenario-based, no direct keypoint references
- MCQ must have exactly 4 options with plausible distractors
- Free-text must include a concise expectedAnswer

KEY POINTS:
${keyPointsList}

LESSON TEXT:
${vars.text}

FAILED QUESTIONS WITH FEEDBACK:
${JSON.stringify(failures, null, 2)}`;
}
```

- [ ] **Step 4: Create the answer evaluation prompt**

Create `src/ai/prompts/evaluation.ts`:

```ts
export function evaluationPrompt(vars: {
  question: string;
  expectedAnswer: string;
  userAnswer: string;
  keyPoints: string[];
  text: string;
}): string {
  const keyPointsList = vars.keyPoints
    .map((kp, i) => `${i}. ${kp}`)
    .join("\n");

  return `You are grading a student's answer to an aviation knowledge question.

QUESTION: ${vars.question}
EXPECTED ANSWER: ${vars.expectedAnswer}
STUDENT'S ANSWER: ${vars.userAnswer}

KEY POINTS:
${keyPointsList}

LESSON TEXT:
${vars.text}

Score the student's answer from 0 to 100:
- 0: Completely wrong or irrelevant
- 25: Shows some awareness but misses key concepts
- 50: Partially correct, missing important details
- 75: Mostly correct with minor gaps
- 100: Fully correct and demonstrates clear understanding

Provide a brief explanation of what the student got right, what they missed, and what the ideal answer includes.`;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/ai/prompts/
git commit -m "feat(ai): add modular prompt templates for generation, evaluation, and optimization"
```

---

### Task 5: Answer Evaluation Logic (`evaluate-answer.ts`)

**Files:**
- Create: `src/ai/evaluate-answer.ts`
- Test: `src/ai/__tests__/evaluate-answer.test.ts`

- [ ] **Step 1: Write tests for MCQ evaluation (deterministic, no AI)**

Create `src/ai/__tests__/evaluate-answer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateMCQ } from "../evaluate-answer";
import type { AITestMCQQuestion } from "../schemas";

const mcqQuestion: AITestMCQQuestion = {
  id: "q1",
  type: "mcq",
  question: "Which procedure applies when...?",
  options: [
    { id: "q1a", value: "Option A" },
    { id: "q1b", value: "Option B" },
    { id: "q1c", value: "Option C" },
    { id: "q1d", value: "Option D" },
  ],
  correctOptionId: "q1b",
  keyPointIndex: 0,
};

describe("evaluateMCQ", () => {
  it("scores 100 for correct answer", () => {
    const result = evaluateMCQ(mcqQuestion, "q1b");
    expect(result.score).toBe(100);
    expect(result.explanation).toContain("Option B");
  });

  it("scores 0 for incorrect answer", () => {
    const result = evaluateMCQ(mcqQuestion, "q1a");
    expect(result.score).toBe(0);
    expect(result.explanation).toContain("Option B");
  });

  it("returns the question id and type", () => {
    const result = evaluateMCQ(mcqQuestion, "q1c");
    expect(result.questionId).toBe("q1");
    expect(result.type).toBe("mcq");
    expect(result.userAnswer).toBe("q1c");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/ai/__tests__/evaluate-answer.test.ts
```

Expected: FAIL — cannot resolve `../evaluate-answer`.

- [ ] **Step 3: Implement evaluate-answer.ts**

Create `src/ai/evaluate-answer.ts`:

```ts
import { generateObject } from "ai";
import { sonnet } from "./ai-provider";
import { evaluationPrompt } from "./prompts/evaluation";
import {
  AIFreeTextEvalOutputSchema,
  type AIEvaluationResult,
  type AITestMCQQuestion,
  type AITestFreeTextQuestion,
} from "./schemas";

export function evaluateMCQ(
  question: AITestMCQQuestion,
  userAnswer: string,
): AIEvaluationResult {
  const correctOption = question.options.find(
    (o) => o.id === question.correctOptionId,
  );
  const isCorrect = userAnswer === question.correctOptionId;

  return {
    questionId: question.id,
    type: "mcq",
    score: isCorrect ? 100 : 0,
    userAnswer,
    explanation: `The correct answer is: ${correctOption?.value ?? question.correctOptionId}`,
  };
}

export async function evaluateFreeText(
  question: AITestFreeTextQuestion,
  userAnswer: string,
  keyPoints: string[],
  text: string,
): Promise<AIEvaluationResult> {
  const { object } = await generateObject({
    model: sonnet,
    schema: AIFreeTextEvalOutputSchema,
    prompt: evaluationPrompt({
      question: question.question,
      expectedAnswer: question.expectedAnswer,
      userAnswer,
      keyPoints,
      text,
    }),
  });

  return {
    questionId: question.id,
    type: "free-text",
    score: object.score,
    userAnswer,
    explanation: object.explanation,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/ai/__tests__/evaluate-answer.test.ts
```

Expected: All tests PASS (only MCQ tests run — `evaluateFreeText` is async and calls AI, tested via integration).

- [ ] **Step 5: Commit**

```bash
git add src/ai/evaluate-answer.ts src/ai/__tests__/evaluate-answer.test.ts
git commit -m "feat(ai): add answer evaluation with deterministic MCQ + AI free-text grading"
```

---

### Task 6: Test Generation with Evaluator-Optimizer Loop

**Files:**
- Create: `src/ai/generate-test.ts`

- [ ] **Step 1: Implement the evaluator-optimizer orchestrator**

Create `src/ai/generate-test.ts`:

```ts
import { generateObject } from "ai";
import { sonnet, haiku } from "./ai-provider";
import { generationPrompt } from "./prompts/generation";
import { evaluatorPrompt } from "./prompts/evaluator";
import { optimizerPrompt } from "./prompts/optimizer";
import {
  AITestGenerationOutputSchema,
  EvaluatorOutputSchema,
  type AITest,
  type AITestQuestion,
} from "./schemas";

const MAX_RETRIES = 2;

export async function generateTest(
  lessonSlug: string,
  keyPoints: string[],
  text: string,
): Promise<AITest> {
  const questionCount = keyPoints.length * 2;
  const mcqCount = Math.round(questionCount * 0.7);
  const freeTextCount = questionCount - mcqCount;

  let questions = await generate(keyPoints, text, questionCount, mcqCount, freeTextCount);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const evaluation = await evaluate(keyPoints, text, questions);

    if (evaluation.allPassed) break;

    const failedIds = new Set(
      evaluation.results.filter((r) => !r.pass).map((r) => r.questionId),
    );
    const failedQuestions = questions.filter((q) => failedIds.has(q.id));
    const passedQuestions = questions.filter((q) => !failedIds.has(q.id));
    const failedFeedback = evaluation.results.filter((r) => !r.pass);

    const regenerated = await optimize(keyPoints, text, failedQuestions, failedFeedback);
    questions = [...passedQuestions, ...regenerated];
  }

  return { lessonSlug, questions };
}

async function generate(
  keyPoints: string[],
  text: string,
  questionCount: number,
  mcqCount: number,
  freeTextCount: number,
): Promise<AITestQuestion[]> {
  const { object } = await generateObject({
    model: sonnet,
    schema: AITestGenerationOutputSchema,
    prompt: generationPrompt({ keyPoints, text, questionCount, mcqCount, freeTextCount }),
  });
  return object.questions;
}

async function evaluate(
  keyPoints: string[],
  text: string,
  questions: AITestQuestion[],
) {
  const { object } = await generateObject({
    model: haiku,
    schema: EvaluatorOutputSchema,
    prompt: evaluatorPrompt({ keyPoints, text, questions }),
  });
  return object;
}

async function optimize(
  keyPoints: string[],
  text: string,
  failedQuestions: AITestQuestion[],
  evaluatorFeedback: { questionId: string; pass: boolean; reason: string }[],
): Promise<AITestQuestion[]> {
  const { object } = await generateObject({
    model: sonnet,
    schema: AITestGenerationOutputSchema,
    prompt: optimizerPrompt({ keyPoints, text, failedQuestions, evaluatorFeedback }),
  });
  return object.questions;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ai/generate-test.ts
git commit -m "feat(ai): add evaluator-optimizer loop for test generation"
```

---

### Task 7: Database Table + Query Functions

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/lesson-test.ts`

- [ ] **Step 1: Add the `lessonTestResultsTable` to schema.ts**

Add the following at the end of `src/db/schema.ts` (before the closing of the file, after the last table definition):

```ts
export const lessonTestResultsTable = pgTable(
  "lesson_test_results",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    lessonSlug: text("lesson_slug")
      .notNull()
      .references(() => lessonsTable.slug, { onDelete: "cascade" }),
    questions: json("questions").notNull(),
    answers: json("answers").notNull().default([]),
    totalScore: integer("total_score"),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("lesson_test_results_user_id_idx").on(table.userId),
    index("lesson_test_results_user_lesson_idx").on(table.userId, table.lessonSlug),
  ],
);

export const lessonTestResultsInsertSchema = createInsertSchema(lessonTestResultsTable);
export type LessonTestResultsInsert = z.infer<typeof lessonTestResultsInsertSchema>;

export const lessonTestResultsSelectSchema = createSelectSchema(lessonTestResultsTable);
export type LessonTestResultsSelect = z.infer<typeof lessonTestResultsSelectSchema>;

export const lessonTestResultsTableRelations = relations(lessonTestResultsTable, ({ one }) => ({
  user: one(userProfileTable, {
    fields: [lessonTestResultsTable.userId],
    references: [userProfileTable.userId],
  }),
  lesson: one(lessonsTable, {
    fields: [lessonTestResultsTable.lessonSlug],
    references: [lessonsTable.slug],
  }),
}));
```

- [ ] **Step 2: Create the query functions**

Create `src/db/lesson-test.ts`:

```ts
import { eq, and, desc } from "drizzle-orm";
import { db } from "#/db";
import { lessonTestResultsTable } from "./schema";

export async function saveTestResult(data: {
  userId: string;
  lessonSlug: string;
  questions: unknown;
  answers: unknown;
  totalScore: number;
}) {
  const [result] = await db
    .insert(lessonTestResultsTable)
    .values({
      userId: data.userId,
      lessonSlug: data.lessonSlug,
      questions: data.questions,
      answers: data.answers,
      totalScore: data.totalScore,
      completedAt: new Date(),
    })
    .returning();

  return result;
}

export async function getTestResults(userId: string, lessonSlug: string) {
  return db
    .select()
    .from(lessonTestResultsTable)
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        eq(lessonTestResultsTable.lessonSlug, lessonSlug),
      ),
    )
    .orderBy(desc(lessonTestResultsTable.createdAt));
}
```

- [ ] **Step 3: Push schema to database**

```bash
pnpm db:push
```

Expected: Schema changes applied. New table `lesson_test_results` created.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/lesson-test.ts
git commit -m "feat(db): add lesson_test_results table and query functions"
```

---

### Task 8: API Routes

**Files:**
- Create: `src/routes/api/lesson/ai-test/generate.ts`
- Create: `src/routes/api/lesson/ai-test/evaluate.ts`
- Create: `src/routes/api/lesson/ai-test/save-results.ts`
- Create: `src/routes/api/lesson/ai-test/results.ts`

- [ ] **Step 1: Create the generate route**

Create `src/routes/api/lesson/ai-test/generate.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { generateTest } from "#/ai/generate-test";

export const Route = createFileRoute("/api/lesson/ai-test/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const { lessonSlug, keyPoints, text } = body as {
          lessonSlug: string;
          keyPoints: string[];
          text: string;
        };

        if (!lessonSlug || !keyPoints?.length || !text) {
          return new Response("lessonSlug, keyPoints, and text are required", {
            status: 400,
          });
        }

        try {
          const test = await generateTest(lessonSlug, keyPoints, text);
          return Response.json(test);
        } catch (error) {
          console.error("AI test generation failed:", error);
          return Response.json(
            { error: "Failed to generate test" },
            { status: 500 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 2: Create the evaluate route**

Create `src/routes/api/lesson/ai-test/evaluate.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { evaluateMCQ, evaluateFreeText } from "#/ai/evaluate-answer";
import type { AITestQuestion } from "#/ai/schemas";

export const Route = createFileRoute("/api/lesson/ai-test/evaluate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const { question, userAnswer, keyPoints, text } = body as {
          question: AITestQuestion;
          userAnswer: string;
          keyPoints: string[];
          text: string;
        };

        if (!question || !userAnswer) {
          return new Response("question and userAnswer are required", {
            status: 400,
          });
        }

        try {
          if (question.type === "mcq") {
            const result = evaluateMCQ(question, userAnswer);
            return Response.json(result);
          }

          const result = await evaluateFreeText(
            question,
            userAnswer,
            keyPoints,
            text,
          );
          return Response.json(result);
        } catch (error) {
          console.error("AI answer evaluation failed:", error);
          return Response.json(
            { error: "Failed to evaluate answer" },
            { status: 500 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 3: Create the save-results route**

Create `src/routes/api/lesson/ai-test/save-results.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { saveTestResult } from "#/db/lesson-test";

export const Route = createFileRoute("/api/lesson/ai-test/save-results")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const { lessonSlug, test, evaluations, totalScore } = body as {
          lessonSlug: string;
          test: unknown;
          evaluations: unknown;
          totalScore: number;
        };

        if (!lessonSlug || !test || !evaluations || totalScore == null) {
          return new Response("All fields are required", { status: 400 });
        }

        try {
          const result = await saveTestResult({
            userId: session.user.id,
            lessonSlug,
            questions: test,
            answers: evaluations,
            totalScore,
          });
          return Response.json(result);
        } catch (error) {
          console.error("Failed to save test results:", error);
          return Response.json(
            { error: "Failed to save results" },
            { status: 500 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 4: Create the results route**

Create `src/routes/api/lesson/ai-test/results.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { getTestResults } from "#/db/lesson-test";

export const Route = createFileRoute("/api/lesson/ai-test/results")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const lessonSlug = searchParams.get("lessonSlug");

        if (!lessonSlug) {
          return new Response("lessonSlug is required", { status: 400 });
        }

        try {
          const results = await getTestResults(session.user.id, lessonSlug);
          return Response.json(results);
        } catch (error) {
          console.error("Failed to fetch test results:", error);
          return Response.json(
            { error: "Failed to fetch results" },
            { status: 500 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/lesson/ai-test/
git commit -m "feat(api): add AI test generate, evaluate, save-results, and results routes"
```

---

### Task 9: Client State — Query Keys + Jotai Atoms

**Files:**
- Modify: `src/hooks/data/keys.ts`
- Create: `src/atoms/lesson-ai-test.ts`

- [ ] **Step 1: Add query keys**

Add to `src/hooks/data/keys.ts`:

```ts
  aiTestResults: (lessonSlug: string) =>
    ['ai-test-results', lessonSlug] as const,
```

This goes inside the `queryKeys` object, after the existing `lessonMaterial` key.

- [ ] **Step 2: Create Jotai atoms for test state**

Create `src/atoms/lesson-ai-test.ts`:

```ts
import { atom } from "jotai";
import { atomFamily } from "jotai-family";
import { atomWithQuery } from "jotai-tanstack-query";
import type { AITest, AIEvaluationResult } from "#/ai/schemas";
import type { LessonTestResultsSelect } from "#/db/schema";
import { queryKeys } from "#/hooks/data/keys";

export const currentTestAtom = atom<AITest | null>(null);

export const currentQuestionIndexAtom = atom(0);

export const evaluationsAtom = atom<AIEvaluationResult[]>([]);

export const isGeneratingAtom = atom(false);

export const isEvaluatingAtom = atom(false);

export const currentQuestionAtom = atom((get) => {
  const test = get(currentTestAtom);
  const index = get(currentQuestionIndexAtom);
  if (!test) return null;
  return test.questions[index] ?? null;
});

export const totalScoreAtom = atom((get) => {
  const evaluations = get(evaluationsAtom);
  if (evaluations.length === 0) return 0;
  const sum = evaluations.reduce((acc, e) => acc + e.score, 0);
  return Math.round(sum / evaluations.length);
});

export const testResultsAtomFamily = atomFamily((lessonSlug: string) =>
  atomWithQuery<LessonTestResultsSelect[]>(() => ({
    queryKey: queryKeys.aiTestResults(lessonSlug),
    queryFn: async () => {
      const response = await fetch(
        `/api/lesson/ai-test/results?lessonSlug=${encodeURIComponent(lessonSlug)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch test results");
      }
      return (await response.json()) as LessonTestResultsSelect[];
    },
    enabled: !!lessonSlug,
    staleTime: 1000 * 60 * 5,
  })),
);
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/data/keys.ts src/atoms/lesson-ai-test.ts
git commit -m "feat(state): add query keys and Jotai atoms for AI test flow"
```

---

### Task 10: Client Hooks — Mutations

**Files:**
- Create: `src/hooks/data/use-lesson-ai-test.ts`

- [ ] **Step 1: Create the hooks file**

Create `src/hooks/data/use-lesson-ai-test.ts`:

```ts
import { useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import type { AITest, AITestQuestion, AIEvaluationResult } from "#/ai/schemas";
import {
  currentTestAtom,
  currentQuestionIndexAtom,
  evaluationsAtom,
  isGeneratingAtom,
  isEvaluatingAtom,
  currentQuestionAtom,
  totalScoreAtom,
  testResultsAtomFamily,
} from "#/atoms/lesson-ai-test";

export const useCurrentTest = () => useAtomValue(currentTestAtom);
export const useCurrentQuestion = () => useAtomValue(currentQuestionAtom);
export const useCurrentQuestionIndex = () => useAtomValue(currentQuestionIndexAtom);
export const useEvaluations = () => useAtomValue(evaluationsAtom);
export const useIsGenerating = () => useAtomValue(isGeneratingAtom);
export const useIsEvaluating = () => useAtomValue(isEvaluatingAtom);
export const useTotalScore = () => useAtomValue(totalScoreAtom);
export const useTestResults = (lessonSlug: string) =>
  useAtomValue(testResultsAtomFamily(lessonSlug));

export function useGenerateTest() {
  const setTest = useSetAtom(currentTestAtom);
  const setIsGenerating = useSetAtom(isGeneratingAtom);
  const setIndex = useSetAtom(currentQuestionIndexAtom);
  const setEvaluations = useSetAtom(evaluationsAtom);

  return useCallback(
    async (lessonSlug: string, keyPoints: string[], text: string) => {
      setIsGenerating(true);
      setIndex(0);
      setEvaluations([]);
      try {
        const response = await fetch("/api/lesson/ai-test/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonSlug, keyPoints, text }),
        });
        if (!response.ok) throw new Error("Failed to generate test");
        const test = (await response.json()) as AITest;
        setTest(test);
        return test;
      } finally {
        setIsGenerating(false);
      }
    },
    [setTest, setIsGenerating, setIndex, setEvaluations],
  );
}

export function useEvaluateAnswer() {
  const setIsEvaluating = useSetAtom(isEvaluatingAtom);
  const setEvaluations = useSetAtom(evaluationsAtom);
  const setIndex = useSetAtom(currentQuestionIndexAtom);

  return useCallback(
    async (
      question: AITestQuestion,
      userAnswer: string,
      keyPoints: string[],
      text: string,
    ) => {
      setIsEvaluating(true);
      try {
        const response = await fetch("/api/lesson/ai-test/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, userAnswer, keyPoints, text }),
        });
        if (!response.ok) throw new Error("Failed to evaluate answer");
        const result = (await response.json()) as AIEvaluationResult;
        setEvaluations((prev) => [...prev, result]);
        setIndex((prev) => prev + 1);
        return result;
      } finally {
        setIsEvaluating(false);
      }
    },
    [setIsEvaluating, setEvaluations, setIndex],
  );
}

export function useSaveResults() {
  return useAtomCallback(
    useCallback(async (get) => {
      const test = get(currentTestAtom);
      const evaluations = get(evaluationsAtom);
      const totalScore = get(totalScoreAtom);

      if (!test) throw new Error("No test to save");

      const response = await fetch("/api/lesson/ai-test/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonSlug: test.lessonSlug,
          test,
          evaluations,
          totalScore,
        }),
      });

      if (!response.ok) throw new Error("Failed to save results");
      return response.json();
    }, []),
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/data/use-lesson-ai-test.ts
git commit -m "feat(hooks): add generate, evaluate, and save mutations for AI test"
```

---

### Task 11: Verify Build

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

```bash
pnpm tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 2: Run all tests**

```bash
pnpm vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Run the dev server**

```bash
pnpm dev
```

Expected: Dev server starts without errors. Verify that the new routes are registered by checking the terminal output for `/api/lesson/ai-test/*` routes.

- [ ] **Step 4: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "chore: fix any build issues from AI test pipeline integration"
```

Only run this if Step 1-3 surfaced issues that needed fixing. Skip if everything passed clean.
