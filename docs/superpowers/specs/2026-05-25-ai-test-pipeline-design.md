# AI Test Pipeline Design

## Overview

Two AI pipelines that generate knowledge assessment tests from lesson material and evaluate user responses in real-time.

- **Pipeline 1 — Test Generation (Evaluator-Optimizer):** Takes lesson `keyPoints[]` and `text` corpus, generates 2 questions per keypoint (mix of MCQ and free-text). An evaluator LLM call checks question quality; the optimizer loop regenerates weak questions until all pass.
- **Pipeline 2 — Answer Evaluation:** Simple evaluator that takes keypoints, text, and a user answer, scores it 0-100.

Results are stored per user per lesson in the database.

## Decisions

| Decision              | Choice                                     | Rationale                                                        |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| Test persistence      | On-the-fly generation                      | Fresh questions each attempt; no caching                         |
| AI model              | Claude Sonnet via Anthropic SDK            | Good quality/cost balance for structured generation + grading    |
| Grading flow          | Immediate per-question                     | Instant feedback after each answer                               |
| Question count        | 2 per keypoint                             | Thorough coverage; test size scales with lesson content          |
| Question mix          | ~70% MCQ + ~30% free-text                 | Mostly structured, with open-ended for deeper understanding      |
| Generation quality    | Evaluator-Optimizer workflow               | Ensures indirect, scenario-based questions; rejects low quality  |
| Result storage        | Full persistence in DB                     | Users can review past attempts and track progress                |
| Prompt management     | Modular prompt files for easy fine-tuning  | Prompts isolated in `src/ai/prompts/` for iteration              |

## Data Model

### Zod Schemas

New schemas in `src/ai/schemas.ts`:

```ts
// MCQ question variant
const AITestMCQQuestionSchema = z.object({
  id: z.string(),
  type: z.literal("mcq"),
  question: z.string().describe("Question text in markdown"),
  options: z.array(z.object({
    id: z.string(),
    value: z.string(),
  })).length(4),
  correctOptionId: z.string(),
  keyPointIndex: z.number().int().min(0),
});

// Free-text question variant
const AITestFreeTextQuestionSchema = z.object({
  id: z.string(),
  type: z.literal("free-text"),
  question: z.string().describe("Question text in markdown"),
  expectedAnswer: z.string().describe("Reference answer for AI grading"),
  keyPointIndex: z.number().int().min(0),
});

// Discriminated union
const AITestQuestionSchema = z.discriminatedUnion("type", [
  AITestMCQQuestionSchema,
  AITestFreeTextQuestionSchema,
]);

// Full test — question count is dynamic (2 * keyPoints.length)
const AITestSchema = z.object({
  lessonSlug: z.string(),
  questions: z.array(AITestQuestionSchema),
});

// Evaluator output — per question quality assessment
const QuestionQualitySchema = z.object({
  questionId: z.string(),
  pass: z.boolean(),
  reason: z.string().describe("Why this question passed or failed quality check"),
});

const EvaluatorOutputSchema = z.object({
  results: z.array(QuestionQualitySchema),
  allPassed: z.boolean(),
});

// Evaluation result per answer
const AIEvaluationResultSchema = z.object({
  questionId: z.string(),
  type: z.enum(["mcq", "free-text"]),
  score: z.number().int().min(0).max(100),
  userAnswer: z.string(),
  explanation: z.string(),
});

// Full test result
const AITestResultSchema = z.object({
  lessonSlug: z.string(),
  test: AITestSchema,
  evaluations: z.array(AIEvaluationResultSchema),
  totalScore: z.number().int().min(0).max(100),
});
```

### Database Table

New table `lessonTestResults` in `src/db/schema.ts`:

```sql
lessonTestResults
  id              serial PK
  userId          text FK -> user.id
  lessonSlug      text NOT NULL
  questions       json NOT NULL       -- AITest (the generated questions)
  answers         json DEFAULT '[]'   -- AIEvaluationResult[] (graded answers)
  totalScore      integer             -- 0-100 percentage, set when complete
  completedAt     timestamp           -- set when all questions answered
  createdAt       timestamp DEFAULT now()
```

One row per test attempt. `answers` array grows as the user progresses through questions.

## Pipeline 1: Test Generation (Evaluator-Optimizer)

Uses the [Evaluator-Optimizer workflow](https://www.anthropic.com/engineering/building-effective-agents): a generator produces questions, an evaluator checks quality, and failed questions loop back through the generator with feedback.

### Route

`POST /api/lesson/ai-test/generate`

### Input

```ts
{ lessonSlug: string, keyPoints: string[], text: string }
```

### Flow

```
keyPoints + text
      |
      v
  [Generator] -- produces 2 questions per keypoint (mix MCQ + free-text)
      |
      v
  [Evaluator] -- checks each question for quality criteria
      |
      +--> all pass? --> return AITest
      |
      +--> some fail? --> feed failures + evaluator feedback back to Generator
                          (max 2 retry iterations, then accept best effort)
```

#### Step 1: Generator

Calls `generateObject` with the **generation prompt**. Produces `2 * keyPoints.length` questions.

- For each keypoint: 1 MCQ + 1 free-text (or vary the mix, but maintain ~70/30 MCQ/free-text overall)
- Questions must be indirect — scenario-based, never quoting the keypoint
- MCQs have 4 options with plausible distractors
- Free-text questions include an `expectedAnswer` reference

#### Step 2: Evaluator

A second `generateObject` call with the **evaluator prompt**. Receives the generated questions + the original keypoints + text. Checks each question against quality criteria:

- **Indirectness:** Does the question avoid directly stating the keypoint?
- **Accuracy:** Is the correct answer actually correct given the text corpus?
- **Plausibility:** Are MCQ distractors plausible but distinguishable?
- **Clarity:** Is the question unambiguous?
- **Coverage:** Does the question actually test the mapped keypoint?

Returns `EvaluatorOutputSchema` — a pass/fail + reason for each question.

#### Step 3: Optimizer Loop

If any questions fail:

1. Collect failed questions + their evaluator feedback
2. Call the generator again with an **optimizer prompt** that includes:
   - The original keypoints + text
   - The failed questions
   - The evaluator's specific feedback for each
   - Instruction to regenerate only the failed questions
3. Merge regenerated questions back into the test
4. Re-evaluate (max 2 total retry iterations to bound cost/latency)
5. After max retries, accept best-effort result

### Prompt Organization

All prompts live in `src/ai/prompts/` as separate files for easy fine-tuning:

```
src/ai/prompts/
  generation.ts        -- system prompt for initial question generation
  evaluator.ts         -- system prompt for quality evaluation
  optimizer.ts         -- system prompt for regenerating failed questions
  evaluation.ts        -- system prompt for grading user answers (Pipeline 2)
```

Each file exports a function that takes template variables and returns the prompt string:

```ts
// src/ai/prompts/generation.ts
export function generationPrompt(vars: {
  keyPoints: string[];
  text: string;
  questionCount: number;
}): string {
  return `...`;
}
```

This keeps prompts isolated, versionable, and easy to A/B test.

## Pipeline 2: Answer Evaluation

Simple evaluator — one `generateObject` call per answer.

### Route

`POST /api/lesson/ai-test/evaluate`

### Input

```ts
{
  question: AITestQuestion,
  userAnswer: string,
  keyPoints: string[],
  text: string,
}
```

### Flow — MCQ

Deterministic, no AI call:

1. Compare `userAnswer` with `question.correctOptionId`
2. Score: 100 if match, 0 if not
3. Build explanation: identify the correct option's `value` text, return "The correct answer is: {correctOption.value}"

### Flow — Free-text

Single `generateObject` call:

1. Call `evaluateAnswer(question, userAnswer, keyPoints, text)` from `src/ai/evaluate-answer.ts`
2. AI receives: the question, the expected answer, the user's answer, the keypoints, and the text corpus
3. AI returns: `{ score: 0-100, explanation: string }`

### Scoring

- MCQ correct: 100 points
- MCQ incorrect: 0 points
- Free-text: 0-100 points (AI-scored)
- **Total score** = sum of all scores / number of questions (0-100 percentage)

## Result Storage

### Route: Save Results

`POST /api/lesson/ai-test/save-results`

Called after the user completes all questions. Persists the full test + evaluations.

Input: `{ lessonSlug: string, test: AITest, evaluations: AIEvaluationResult[], totalScore: number }`

### Route: Get Results

`GET /api/lesson/ai-test/results?lessonSlug={slug}`

Returns all past test attempts for the authenticated user on a given lesson. Sorted by most recent.

## File Structure

```
src/ai/
  ai-provider.ts            -- Anthropic SDK provider + model config
  schemas.ts                -- All Zod schemas (AITest, EvaluatorOutput, EvaluationResult)
  generate-test.ts          -- generateTest(): evaluator-optimizer loop orchestrator
  evaluate-answer.ts        -- evaluateAnswer(): single-call grading
  prompts/
    generation.ts           -- question generation prompt
    evaluator.ts            -- quality check prompt
    optimizer.ts            -- regeneration prompt (includes evaluator feedback)
    evaluation.ts           -- answer grading prompt

src/routes/api/lesson/ai-test/
  generate.ts               -- POST: generate a fresh test (runs eval-opt loop)
  evaluate.ts               -- POST: evaluate one answer (MCQ or free-text)
  save-results.ts           -- POST: persist completed test results
  results.ts                -- GET: fetch past test results

src/db/
  schema.ts                 -- add lessonTestResultsTable (extend existing)
  lesson-test.ts            -- saveTestResult(), getTestResults() query functions

src/hooks/data/
  lesson-ai-test.ts         -- Jotai atom families + TanStack Query mutations

src/atoms/
  lesson-ai-test.ts         -- Client state atoms: currentTest, currentQuestionIndex,
                               answers[], isGenerating, isEvaluating
```

## AI Provider Setup

Requires installing `@ai-sdk/anthropic` provider package:

```bash
pnpm add @ai-sdk/anthropic
```

```ts
// src/ai/ai-provider.ts
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY!,
});

export const sonnet = anthropic("claude-sonnet-4-6");
```

Both pipelines use `generateObject` from the `ai` package with the `sonnet` model and Zod schemas for structured output. The `AI_GATEWAY_API_KEY` env var is already configured.

## Error Handling

- **Generation failure:** Return 500 with error message. Frontend shows retry button.
- **Evaluator-optimizer timeout:** After 2 retry iterations, accept best-effort questions and return them. Never block indefinitely.
- **Evaluation failure (free-text):** Return 500. Frontend allows re-submitting the answer.
- **MCQ evaluation:** Cannot fail (deterministic). Always succeeds.
- **Schema validation:** `generateObject` with Zod ensures type-safe output. If the AI produces invalid output, Vercel AI SDK retries automatically.

## Scope Boundaries

**In scope:**

- AI module (provider, schemas, modular prompts, generation with eval-opt loop, evaluation)
- API routes (4 endpoints)
- DB table + query functions
- Data hooks and Jotai atoms

**Out of scope (future work):**

- UI components for the test experience
- Test history/review UI
- Retry/regeneration UX
- Analytics/reporting dashboard
