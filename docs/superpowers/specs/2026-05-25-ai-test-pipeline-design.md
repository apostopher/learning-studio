# AI Test Pipeline Design

## Overview

Two AI pipelines that generate knowledge assessment tests from lesson material and evaluate user responses in real-time.

- **Pipeline 1 — Test Generation:** Takes lesson `keyPoints[]` and `text` corpus, produces 10 indirect questions (7 MCQ + 3 free-text) via Claude Sonnet
- **Pipeline 2 — Answer Evaluation:** Grades each answer immediately after submission. MCQ: deterministic comparison. Free-text: AI-scored 0-100.

Results are stored per user per lesson in the database.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test persistence | On-the-fly generation | Fresh questions each attempt; no caching |
| AI model | Claude Sonnet via Vercel AI Gateway | Good quality/cost balance for structured generation + grading |
| Grading flow | Immediate per-question | Instant feedback after each answer |
| Question mix | 7 MCQ + 3 free-text | Mostly structured, with open-ended for deeper understanding |
| Result storage | Full persistence in DB | Users can review past attempts and track progress |
| Architecture | Two server routes + `generateObject` | Simple, fully typed, easy to test |

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

// Full test
const AITestSchema = z.object({
  lessonSlug: z.string(),
  questions: z.array(AITestQuestionSchema).length(10),
});

// Evaluation result per question
const AIEvaluationResultSchema = z.object({
  questionId: z.string(),
  type: z.enum(["mcq", "free-text"]),
  score: z.number().int().min(0).max(100),
  isCorrect: z.boolean(),
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

```
lessonTestResults
├── id              serial PK
├── userId          text FK → user.id
├── lessonSlug      text NOT NULL
├── questions       json NOT NULL       — AITest (the generated questions)
├── answers         json DEFAULT '[]'   — AIEvaluationResult[] (graded answers)
├── totalScore      integer             — 0-100 percentage, set when complete
├── completedAt     timestamp           — set when all 10 questions answered
├── createdAt       timestamp DEFAULT now()
```

One row per test attempt. `answers` array grows as the user progresses through questions.

## Pipeline 1: Test Generation

### Route

`POST /api/lesson/ai-test/generate`

### Input

```ts
{ lessonSlug: string, keyPoints: string[], text: string }
```

### Flow

1. Server handler validates input
2. Calls `generateTest(keyPoints, text)` from `src/ai/generate-test.ts`
3. `generateTest` uses Vercel AI SDK `generateObject` with:
   - Model: Claude Sonnet via AI Gateway
   - Output schema: `AITestSchema` (Zod)
   - System prompt (see below)
4. Returns the structured `AITest` validated against schema

### System Prompt Strategy

The system prompt instructs the model to:

- Read all keypoints and the full text corpus
- Map questions to keypoints: if 10+ keypoints exist, select the 10 most substantive. If fewer than 10, distribute questions across available keypoints (some keypoints get 2 questions testing different aspects)
- Questions 1-7: MCQ with 4 options (1 correct + 3 plausible distractors)
- Questions 8-10: Free-text requiring 1-3 sentence answers
- **Indirectness requirement:** Never quote or directly name the keypoint in the question. Instead, present a scenario, analogy, or application question from the text corpus that requires understanding the keypoint to answer correctly.
- Each MCQ must have a `correctOptionId` matching one of its options
- Each free-text must include an `expectedAnswer` reference for the grading pipeline
- Questions should be shuffled so MCQ and free-text are interleaved (not all MCQ first)

### Prompt Template

```
You are an aviation knowledge assessment expert. Given the lesson material below, create a test of 10 questions.

RULES:
- 7 questions must be multiple choice (type: "mcq") with exactly 4 options each
- 3 questions must be free-text (type: "free-text") requiring 1-3 sentence answers
- Each question tests one key point from the lesson, but NEVER quotes or directly references the key point
- Instead, create scenario-based or application questions that require understanding the concept
- MCQ distractors must be plausible but clearly wrong to someone who understands the material
- Free-text expectedAnswer should be a concise, correct reference answer
- Interleave MCQ and free-text questions (don't group by type)
- Generate unique string IDs for each question and option

KEY POINTS:
{keyPoints}

LESSON TEXT:
{text}
```

## Pipeline 2: Answer Evaluation

### Route

`POST /api/lesson/ai-test/evaluate`

### Input

```ts
{ question: AITestQuestion, userAnswer: string, text: string }
```

### Flow — MCQ

1. Compare `userAnswer` with `question.correctOptionId`
2. Score: 100 if match, 0 if not
3. Build explanation from the question data: identify the correct option's `value` text and return it as "The correct answer is: {correctOption.value}". No AI call needed — deterministic lookup + template.

### Flow — Free-text

1. Call `evaluateAnswer(question, userAnswer, text)` from `src/ai/evaluate-answer.ts`
2. Uses `generateObject` with Claude Sonnet
3. AI receives: the question, the expected reference answer, the user's answer, and the original text corpus
4. AI returns: `{ score: 0-100, explanation: string }`
5. `isCorrect` is derived: `score >= 70`

### Evaluation Prompt Template

```
You are grading a student's answer to an aviation knowledge question.

QUESTION: {question}
EXPECTED ANSWER: {expectedAnswer}
STUDENT'S ANSWER: {userAnswer}

CONTEXT (lesson text):
{text}

Score the student's answer from 0 to 100:
- 0: Completely wrong or irrelevant
- 25: Shows some awareness but misses key concepts
- 50: Partially correct, missing important details
- 75: Mostly correct with minor gaps
- 100: Fully correct and demonstrates clear understanding

Provide a brief explanation of what the student got right, what they missed,
and what the ideal answer includes.
```

### Scoring

- MCQ correct: 100 points
- MCQ incorrect: 0 points
- Free-text: 0-100 points (AI-scored)
- **Total score** = sum of all 10 scores / 10 (produces a 0-100 percentage)

## Result Storage

### Route: Save Results

`POST /api/lesson/ai-test/save-results`

Called after the user completes all 10 questions. Persists the full test + evaluations.

Input: `{ lessonSlug: string, test: AITest, evaluations: AIEvaluationResult[], totalScore: number }`

### Route: Get Results

`GET /api/lesson/ai-test/results?lessonSlug={slug}`

Returns all past test attempts for the authenticated user on a given lesson. Sorted by most recent.

## File Structure

```
src/ai/
  ai-provider.ts          — Vercel AI SDK gateway provider + model config
  schemas.ts              — All Zod schemas (AITest, EvaluationResult, etc.)
  prompts.ts              — System prompt templates for generation and evaluation
  generate-test.ts        — generateTest(keyPoints, text) → AITest
  evaluate-answer.ts      — evaluateAnswer(question, userAnswer, text) → EvaluationResult

src/routes/api/lesson/ai-test/
  generate.ts             — POST: generate a fresh test
  evaluate.ts             — POST: evaluate one answer (MCQ or free-text)
  save-results.ts         — POST: persist completed test results
  results.ts              — GET: fetch past test results

src/db/
  schema.ts               — add lessonTestResultsTable (extend existing)
  lesson-test.ts          — saveTestResult(), getTestResults() query functions

src/hooks/data/
  lesson-ai-test.ts       — Jotai atom families + TanStack Query mutations

src/atoms/
  lesson-ai-test.ts       — Client state atoms: currentTest, currentQuestionIndex,
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
- **Evaluation failure (free-text):** Return 500. Frontend allows re-submitting the answer.
- **MCQ evaluation:** Cannot fail (deterministic). Always succeeds.
- **Schema validation:** `generateObject` with Zod ensures type-safe output. If the AI produces invalid output, Vercel AI SDK retries automatically.

## Scope Boundaries

**In scope:**
- AI module (provider, schemas, prompts, generation, evaluation)
- API routes (4 endpoints)
- DB table + query functions
- Data hooks and Jotai atoms

**Out of scope (future work):**
- UI components for the test experience
- Test history/review UI
- Retry/regeneration UX
- Analytics/reporting dashboard
