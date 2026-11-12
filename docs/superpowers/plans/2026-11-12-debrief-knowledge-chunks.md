# Debrief by Knowledge Chunks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Debriefs track each pilot's mastery of a lesson's knowledge chunks. They aim every retake at the pilot's holes and pass at 100% once every chunk is cleared at ≥ 70.

**Architecture:**
- Each lesson gets one stored, AI-generated chunk list.
- Attempts become server-authoritative. Each answer is graded per chunk on the server, saved as it is given, and updates a per-pilot mastery table. The server short-circuits the attempt when the last hole clears, and finishing an attempt starts a 6-hour retake clock.
- The client stops computing scores. It renders the state the server returns.

**Tech Stack:** TanStack Start server routes, Drizzle + Postgres (hand-written idempotent migrations), AI SDK `generateText` + `Output.object` (Sonnet/Haiku via `#/ai/ai-provider`), zod, jotai, TanStack Query, Base UI, motion, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-debrief-knowledge-chunks-design.md`

## Global Constraints

- **Values:**
  - chunk clears at score **≥ 70** (`CHUNK_CLEAR_SCORE = 70`);
  - **max 8 chunks** per lesson (`MAX_KNOWLEDGE_CHUNKS = 8`);
  - first open is **12 h** after the clock starts (unchanged `DEBRIEF_DELAY_MS`);
  - every retake is **6 h** after the previous attempt finished (`DEBRIEF_RETAKE_DELAY_MS = 6 * 60 * 60_000`).
- Mastery percent = `Math.round(cleared / total * 100)`, and 100 once passed. It is the ONLY debrief number shown anywhere: report, ring, course percent.
- A cleared chunk is never un-cleared by an answer. A pass is permanent, legacy passes included. Regeneration adjusts mastery only for pilots who have not passed.
- `DEBRIEF_PAR_SCORE`, the two-set structure (`src/lib/debrief-sets.ts`), the rewatch rule (`rewatch-required`, `videoRewatchedAtSql`, `src/lib/video-rewatch.ts`, `REWATCH_COPY`) and the client-computed `totalScore` are removed. Delete them; no dead exports.
- **Schema:** never `db:push` or `drizzle-kit generate`. Each schema change is a hand-written idempotent `src/db/migrate-*.ts` with a `db:migrate-*` package script, mirrored in `src/db/schema.ts`.
- **Imports:** use `#/` (vitest can't resolve `@/`). Server-only modules are `*.server.ts` and are never imported by a route component.
- **React and styling:**
  - jotai, not `useState`/`useReducer`; TanStack Query for server state;
  - presentational components are hookless and receive props, with containers wiring them;
  - kebab-case filenames;
  - Base UI first;
  - logical CSS properties only;
  - colours from tokens (`text-primary`, `text-secondary`, `bg-gray-*`, `accent-*`). No palette classes, all text WCAG AA or better.
- **Tests:**
  - assert what the consumer received (the props passed, the response body, the args to a stub), never just that a value exists in state;
  - each new test must be seen failing first;
  - component render tests follow `component-render-test-constraints` (per-file `vi.mock("react")` shim, no jest-dom);
  - run tests with env loaded: `set -a; . ../rmtp-studio/.env.local; set +a; pnpm vitest run <path>`.
- **Copy:**
  - waiting heading after an attempt: `Your next debrief opens in {countdown}`;
  - blocked paste note: `Answers have to be typed — pasting is turned off for debriefs.`;
  - mastery line: `{cleared} of {total} knowledge chunks cleared`.

## Review Focus

1. **Double submit / two tabs:** the same answer posted twice, or from two tabs, must grade and count once. The second post returns the stored result. Test in Task 6.
2. **The source disappears mid-attempt** (material deleted or captions removed): an open attempt must still be answerable from its stored questions and chunks. It must not 422 or reset. Test in Task 6.
3. **Regeneration while an attempt is open:** the open attempt keeps grading against the chunk version it started with. Only the next attempt uses the new chunks. Test in Task 4.
4. **Clock skew between the countdown and the server:** a client whose countdown reaches zero before the server allows the attempt must get `retake-waiting` back, not an error. It then re-arms. Test in Task 9.
5. **A lesson whose generated chunks come back empty or over 8:** empty → treat as no debrief source (the existing 422 path). More than 8 → reject and retry once, never truncate silently. Test in Task 3.

---

### Task 1: Schema and migration

**Files:**
- Create: `src/db/migrate-knowledge-chunks.ts`
- Modify: `src/db/schema.ts` (new tables, plus columns on `lessonTestResultsTable`), `package.json` (script `db:migrate-knowledge-chunks`)
- Test: `src/db/__tests__/migrate-knowledge-chunks.test.ts`

**Interfaces — Produces (Drizzle tables and exported row types):**
- `lessonKnowledgeChunksTable` (`lesson_knowledge_chunks`):
  - `lessonId` int → `lessons.id`, cascade, **unique**;
  - `version` int not null;
  - `sourceFingerprint` text not null;
  - `chunks` jsonb not null, holding `KnowledgeChunk[]`;
  - `createdAt`.
- `debriefChunkMasteryTable` (`debrief_chunk_mastery`):
  - `userId`, `lessonId`, `chunkId` text, `latestScore` int not null, `clearedAt` timestamptz null, `updatedAt`;
  - unique (`userId`, `lessonId`, `chunkId`).
- `debriefPassesTable` (`debrief_passes`):
  - `userId`, `lessonSlug` → `lessons.slug`, `passedAt` timestamptz;
  - unique (`userId`, `lessonSlug`).
- `debriefAnswerLogsTable` (`debrief_answer_logs`):
  - `attemptId` → `lesson_test_results.id`, cascade;
  - `questionId` text;
  - `metrics` jsonb (`AnswerMetrics`);
  - `createdAt`;
  - unique (`attemptId`, `questionId`).
- `lessonTestResultsTable` gains nullable columns:
  - `format` text (`'knowledge-chunks-v1'` for new attempts, null for legacy);
  - `chunkVersion` int;
  - `draft` jsonb (`{ questionId: string; text: string } | null`);
  - `finishedReason` text (`'all-answered' | 'all-cleared'`).
- **Migration backfill:** insert a `debrief_passes` row for every (user, lesson_slug) with a completed `lesson_test_results` row where `total_score >= 75`, `on conflict do nothing`. These are the legacy passes, kept permanent.

- [ ] **Step 1: Write the failing test.** The test renders the migration's statements with a stub `db.execute` (pattern: `migrate-debrief-review.test.ts`). It asserts that:
  - the backfill statement selects `total_score >= 75` and `completed_at is not null`, and inserts `on conflict do nothing`;
  - every `create` uses `if not exists`.
- [ ] **Step 2: Run it and see it fail** with `Cannot find module '../migrate-knowledge-chunks'`. Command: `pnpm vitest run src/db/__tests__/migrate-knowledge-chunks.test.ts`.
- [ ] **Step 3: Implement** the migration (pattern: `src/db/migrate-video-calls.ts`) and the matching `schema.ts` definitions. Add the package script.
- [ ] **Step 4: Run** the test and `pnpm tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** with message `feat(debrief): schema for knowledge chunks, chunk mastery, permanent passes, answer logs`.

### Task 2: Mastery and schedule rules (pure)

**Files:**
- Create: `src/lib/debrief-mastery.ts`
- Modify: `src/lib/debrief-schedule.ts`
- Delete: `src/lib/debrief-sets.ts`, `src/lib/video-rewatch.ts` and their tests
- Test: `src/lib/__tests__/debrief-mastery.test.ts`, `src/lib/__tests__/debrief-schedule.test.ts` (rewrite)

**Interfaces — Produces:**
- `KnowledgeChunk = { id: string; title: string; summary: string }`. Ids are stable within a version, e.g. `"c1"`.
- `ChunkMastery = { chunkId: string; latestScore: number; cleared: boolean }`.
- `CHUNK_CLEAR_SCORE = 70`, `MAX_KNOWLEDGE_CHUNKS = 8`.
- `applyChunkScore(prev: ChunkMastery | undefined, chunkId: string, score: number): ChunkMastery`. Cleared stays cleared. `latestScore` always records the score.
- `masteryPercent(m: { cleared: number; total: number; passed: boolean }): number`. Returns 100 when passed. Returns 0 when `total` is 0.
- `isAllCleared(chunks: KnowledgeChunk[], mastery: ChunkMastery[]): boolean`.
- `planAttemptFocus(chunks, mastery): { holes: string[]; review: string[] }`:
  - with no mastery rows, every chunk is a hole (first attempt);
  - otherwise holes = uncleared chunks, lowest `latestScore` first, capped at `MAX_KNOWLEDGE_CHUNKS`;
  - review = up to 2 cleared chunks, those with the lowest `latestScore` first, and none when nothing is cleared.
- In `debrief-schedule.ts`:
  - `DEBRIEF_RETAKE_DELAY_MS`;
  - `DebriefFacts = { clockStartAt: string | null; passed: boolean; lastFinishedAt: string | null; hasOpenAttempt: boolean; mastery: { cleared: number; total: number } | null }`;
  - `DebriefState = not-done | waiting{availableAt} | open{retake: boolean; resume: boolean} | retake-waiting{availableAt} | passed`;
  - `computeDebriefState(facts, now)`:
    - `hasOpenAttempt` → `open{resume:true}`, regardless of the clock;
    - otherwise `lastFinishedAt` + 6 h gates retakes;
    - otherwise `clockStartAt` + 12 h gates the first attempt.

- [ ] **Step 1: Write the failing tests.**
  - `applyChunkScore(cleared, 'c1', 20).cleared === true`
  - `applyChunkScore(undefined, 'c1', 70).cleared === true`
  - `applyChunkScore(undefined, 'c1', 69).cleared === false`
  - `masteryPercent({cleared:5,total:7,passed:false}) === 71`
  - `masteryPercent({cleared:4,total:8,passed:true}) === 100`
  - `planAttemptFocus(7 chunks, [])` → `{holes: all 7 ids in order, review: []}`
  - with c1..c5 cleared and c6=40, c7=55 → `{holes:['c6','c7'], review: two of c1..c5}`
  - `computeDebriefState({..., lastFinishedAt:'2026-11-12T00:00:00Z'}, new Date('2026-11-12T05:59:00Z'))` → `retake-waiting`, `availableAt '2026-11-12T06:00:00.000Z'`
  - at `06:00` → `open{retake:true}`
  - with `hasOpenAttempt:true` and `lastFinishedAt` 1 minute ago → `open{resume:true}`
- [ ] **Step 2: Run them and see them fail.** Command: `pnpm vitest run src/lib/__tests__/debrief-mastery.test.ts src/lib/__tests__/debrief-schedule.test.ts`.
- [ ] **Step 3: Implement.** Remove `DEBRIEF_PAR_SCORE`, `isPass`, `rewatch-required` and `hasVideo`/`rewatchedAt` from facts. Leave `debriefClockStart` unchanged. Run `pnpm tsc --noEmit` to list the now-broken callers. Do not fix them here: Tasks 6–10 own them, and this task's commit may leave tsc red only in those listed files. Record the list in the commit body.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(debrief): mastery rules and 6h retake schedule`.

### Task 3: Knowledge chunk generation and matching (AI)

**Files:**
- Create: `src/ai/generate-knowledge-chunks.ts`, `src/ai/match-knowledge-chunks.ts`, `src/ai/prompts/knowledge-chunks.ts`
- Modify: `src/lib/lesson-debrief-source.server.ts`
- Test: `src/ai/__tests__/generate-knowledge-chunks.test.ts`, `src/ai/__tests__/match-knowledge-chunks.test.ts`, `src/lib/__tests__/lesson-debrief-source.test.ts`

**Interfaces:**
- **Consumes:** `KnowledgeChunk` and `MAX_KNOWLEDGE_CHUNKS` (Task 2).
- **Produces:**
  - `resolveDebriefSource(lessonSlug, courseId)` returns `{ kind; keyPoints: string[]; context: string }`, with `text` renamed to `context`. Key points follow today's precedence: authored, then derived from the material text, then derived from the transcript. The context is the transcript from the lesson's **home course** when one exists, otherwise the material text. Resolve the home course via the lesson's discipline placement (see `src/db/course-content-gating` / remix helpers). If none exists, use the `courseId` passed in.
  - `generateKnowledgeChunks({ keyPoints, context }): Promise<KnowledgeChunk[]>` uses Sonnet:
    - the output schema is `.min(1).max(MAX_KNOWLEDGE_CHUNKS)`;
    - on a schema failure it retries once, then throws;
    - the prompt anchors one chunk per key point, adds chunks for uncovered transcript teaching, and merges the least important chunks beyond 8;
    - ids are assigned `c1..cN` in code, not by the model.
  - `matchKnowledgeChunks(oldChunks, newChunks): Promise<Record<string, string | null>>` uses Haiku. It maps old id → new id with the same meaning, or null. Code enforces at most one old id per new id: on a duplicate, keep the first and null the rest.

- [ ] **Step 1: Write the failing tests.** Stub `generateText` with `vi.hoisted`.
  - The generate call's prompt contains every key point verbatim, plus the context.
  - The returned chunk ids are `['c1','c2',…]` whatever the model returned.
  - A 9-item model output triggers exactly 2 `generateText` calls, then throws.
  - In `match`, a model output mapping two old ids to `n1` returns the second as `null`.
  - Source: a lesson with material + authored key points + a transcript returns `context === transcript`. Without a transcript, `context === material.text`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Update the source's callers' field name (`text` → `context`) as part of this task.
- [ ] **Step 4: Run** the tests and `pnpm tsc --noEmit` for these files. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(debrief): AI knowledge chunks from key points + home-course transcript`.

### Task 4: Lesson chunk store and regeneration carry-over

**Files:**
- Create: `src/db/knowledge-chunks.ts` (queries), `src/lib/knowledge-chunks.server.ts`
- Test: `src/lib/__tests__/knowledge-chunks.test.ts`

**Interfaces:**
- **Consumes:** Task 1 tables; Task 3 `generateKnowledgeChunks`, `matchKnowledgeChunks`, `resolveDebriefSource`.
- **Produces:**
  - `ensureLessonChunks(lessonId: number, lessonSlug: string, courseId: number): Promise<{ version: number; chunks: KnowledgeChunk[] } | null>`:
    - returns null when there is no source;
    - fingerprint = sha256 of (`'knowledge-chunks-v1'`, keyPoints, context);
    - when the fingerprint matches the stored row, return it with no model call;
    - when it differs, generate, bump `version`, and call `carryOverMastery`;
    - serialise with a Redis claim (pattern: `prepareDebrief`'s `claimKey`), so concurrent pilots don't regenerate twice.
  - `carryOverMastery(lessonId, mapping: Record<string, string | null>): Promise<void>`. For every user **without** a `debrief_passes` row for the lesson:
    - each cleared row whose old id maps to a new id is rewritten to the new id, keeping `clearedAt`;
    - all other rows for that lesson are deleted.

    Users with a pass are untouched.
  - `getLessonChunks(lessonId, version?)`: reads the current list, or a given version. Open attempts store their `chunkVersion` and `questions`, so grading reads chunks from the attempt itself (see Task 6), never from this table.

- [ ] **Step 1: Write the failing tests.** Use a stub db and AI.
  - A matching fingerprint → zero `generateKnowledgeChunks` calls.
  - A changed fingerprint → one call, then `version` +1 in the upsert args.
  - `carryOverMastery` with mapping `{c1:'c2', c2:null}`:
    - the update issued for a non-passed user sets chunk `c1`→`c2` only on cleared rows;
    - the delete covers that user's remaining rows;
    - no statement targets a user present in `debrief_passes`. Assert on the rendered SQL via `renderSql`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(debrief): stored lesson chunks; regeneration keeps matching cleared chunks`.

### Task 5: Chunk-tagged question generation and per-chunk grading (AI)

**Files:**
- Modify: `src/ai/schemas.ts`, `src/ai/generate-test.ts`, `src/ai/prompts/generation.ts`, `src/ai/prompts/evaluator.ts`, `src/ai/prompts/optimizer.ts`, `src/ai/evaluate-answer.ts`, `src/ai/prompts/evaluation.ts`
- Test: `src/ai/__tests__/generate-test.test.ts`, `src/ai/__tests__/evaluate-answer.test.ts`, `src/ai/__tests__/schemas.test.ts`

**Interfaces:**
- **Consumes:** `KnowledgeChunk` and the `planAttemptFocus` output (Task 2).
- **Produces:**
  - `AITestFreeTextQuestionSchema` adds `chunkIds: z.array(z.string()).min(1).max(2)`. `keyPointIndex` becomes optional, so legacy attempts still parse.
  - `generateTest({ lessonSlug, chunks, context, focus: { holes: string[]; review: string[] }, avoidQuestions: string[] }): Promise<AITest>`:
    - exactly one question per hole id, plus one per review id, in that order;
    - each question's `chunkIds[0]` is its focus chunk;
    - after the evaluate/optimise loop, code rejects or replaces any question whose `chunkIds[0]` doesn't match its slot, or that cites an unknown chunk id;
    - `avoidQuestions` are the pilot's earlier question texts for this lesson, and the prompt forbids rewording them.
  - `ChunkJudgementSchema = { chunkId; conveyed: 'fully'|'partly'|'not'; note: string }`. `AIFreeTextEvalOutputSchema` becomes `{ chunkJudgements: ChunkJudgement[]; incorrectClaims: string[]; revisitNote: string }`:
    - `revisitNote` is empty when every judged chunk is fully conveyed;
    - otherwise it is 1–3 sentences in second person, addressing what this answer said.
  - `scoreChunkJudgement(j, incorrectClaims): number`:
    - fully = 100, partly = 50, not = 0;
    - minus 25 per incorrect claim, capped at half of what was earned, matching today's `scoreFreeTextEval` penalty rule.
  - `evaluateFreeText(question, userAnswer, chunks: KnowledgeChunk[], context): Promise<AIEvaluationResult>`:
    - judges ONLY `question.chunkIds`;
    - the result adds `chunkScores: Record<string, number>` and `revisitNote`;
    - `score` = mean of `chunkScores`.
  - `AIEvaluationResultSchema` gains optional `chunkScores` and `revisitNote`. `essentialIdeas` stays optional for legacy rows.

- [ ] **Step 1: Write the failing tests.**
  - The generate prompt includes each hole chunk's title + summary, plus the `avoidQuestions` text.
  - With focus `{holes:['c6','c7'], review:['c1']}`, the result's `chunkIds[0]` values equal `['c6','c7','c1']`.
  - A model question citing `c99` is replaced via the optimise path.
  - In the evaluate tests, a judgement of c1 fully plus c2 partly, with one incorrect claim, gives `chunkScores {c1: 75, c2: 25}` (penalty capped at half), `score 50`.
  - The evaluator prompt lists only the question's `chunkIds`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(debrief): questions tagged to chunks; grading judged per chunk with revisit notes`.

### Task 6: Server-authoritative attempts (start, resume, answer, draft)

**Files:**
- Create: `src/lib/debrief-attempt.server.ts`, `src/db/debrief-attempts.ts`, routes `src/routes/api/lesson/debrief/start.ts`, `src/routes/api/lesson/debrief/answer.ts`, `src/routes/api/lesson/debrief/draft.ts`
- Modify: `src/lib/prepared-debrief.server.ts` (`DEBRIEF_FORMAT = 'knowledge-chunks-v1'`; prepare takes focus), `src/db/lesson-test.ts` (`getDebriefFacts` reads the new facts)
- Delete: `src/routes/api/lesson/ai-test/generate.ts`, `evaluate.ts`, `save-results.ts` and their tests, after grepping for other callers. `evaluate.ts`'s MCQ branch is used only by debriefs; confirm with a grep before deleting.
- Test: `src/lib/__tests__/debrief-attempt.test.ts`, `src/routes/api/lesson/debrief/__tests__/*.test.ts`

**Interfaces:**
- **Consumes:** Tasks 2, 4 and 5. `getDebriefAccess` (now gated by the new `computeDebriefState`).
- **Produces:**
  - `ClientQuestion = { id; question: string }`. **The client never receives `expectedAnswer` or `chunkIds`.**
  - `startOrResumeAttempt({ userId, courseId, lessonId, lessonSlug }): Promise<{ attemptId; questions: ClientQuestion[]; answered: { questionId; score; revisitNote }[]; draft: { questionId; text } | null; mastery: { cleared; total } }>`:
    - when an unfinished `format='knowledge-chunks-v1'` row exists for the user and lesson, return it (resume);
    - otherwise `ensureLessonChunks`, then `planAttemptFocus`, then take the prepared test if its fingerprint (chunk version + focus) matches, else `generateTest`;
    - then insert a row with `questions`, `chunkVersion`, `format`, `answers: []`;
    - a unique partial index or a `select … for update` stops two unfinished rows per user and lesson.
  - `answerQuestion({ userId, attemptId, questionId, answer, metrics: AnswerMetrics }): Promise<{ evaluation: { score; revisitNote }; mastery: { cleared; total; percent }; finished: null | 'all-answered' | 'all-cleared' }>`:
    - idempotent per (`attemptId`, `questionId`): a repeat returns the stored evaluation with no AI call;
    - grades with chunks read from the attempt's `chunkVersion`;
    - applies `applyChunkScore` per `chunkScores` entry and appends to `answers`;
    - inserts a `debrief_answer_logs` row;
    - clears `draft`;
    - when `isAllCleared`, sets `completed_at`, `total_score=100`, `finishedReason='all-cleared'` and inserts `debrief_passes`;
    - when every question is answered, sets `completed_at`, `total_score` = mastery percent and `finishedReason='all-answered'`, then `waitUntil(prepareDebrief(...))` for the next attempt;
    - calls `settleProgress` on finish (promotion), as `save-results` did.
  - `saveDraft({ userId, attemptId, questionId, text }): Promise<void>`: writes `draft` on the user's own unfinished attempt only. Text is capped at 10,000 characters.
  - The routes are POST, session-gated, and zod-validated. The start route returns 409 with the `debriefNotOpen` body when the state isn't open. `answer` and `draft` return 403 for another user's attempt or a finished one.
  - `AnswerMetrics` (zod, in `src/lib/answer-metrics.ts`), all non-negative ints, ms where they are times:
    - `msOnQuestion`, `msToFirstKey`;
    - `deletions`, `charsDeleted`;
    - `rewrites`;
    - `pasteBlocked`;
    - `msHidden`;
    - `finalLength`.

    Forward hook: comment that nothing reads it in v1, and that it is kept for difficulty-detection research.

- [ ] **Step 1: Write the failing tests.** Use stub db and AI collaborators, asserting on their args.
  - Start with an unfinished row → the response's `questions` equal the stored ones, and `generateTest` is not called.
  - Start fresh → `generateTest` receives `focus` from `planAttemptFocus`, and the inserted row has `format 'knowledge-chunks-v1'`.
  - The start response body has no `expectedAnswer` or `chunkIds` anywhere (JSON string check).
  - Answer called twice with the same `questionId` → `evaluateFreeText` is called once. **(Review Focus 1)**
  - An answer that clears the last hole → the response has `finished 'all-cleared'`, the `debrief_passes` insert args carry the user and lesson slug, and no further question is required.
  - An answer whose chunk is already cleared but scores 10 → the mastery upsert args keep `clearedAt` non-null.
  - The answer route grades from the stored attempt even when `resolveDebriefSource` returns null. **(Review Focus 2)**
  - The draft route rejects a finished attempt with 403.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Store prepared tests keyed by fingerprint = sha256(`DEBRIEF_FORMAT`, chunk version, sorted focus ids). `prepareDebrief` computes focus from current mastery.
- [ ] **Step 4: Run** the tests and `pnpm tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(debrief): server-graded resumable attempts with per-chunk mastery and short circuit`.

### Task 7: Progress rollup reads mastery

**Files:**
- Modify: `src/db/progress-components.ts`, `src/lib/course-progress-agg.ts`, `src/components/sidebar/compute-lesson-ring.ts`, `src/components/sidebar/compute-sidebar-percents.ts`, `src/data-hooks/use-course-progress-summary.ts`, `src/lib/course-card-resume.ts` (if it reads debrief facts)
- Test: the existing tests for each file, updated, plus `src/db/__tests__/full-watch-sql-scope.test.ts` (keep green)

**Interfaces:**
- **Consumes:** Task 1 tables, Task 2 `DebriefFacts` / `masteryPercent`.
- **Produces:**
  - Rollup columns:
    - `debriefPassed` = exists in `debrief_passes`;
    - `lastFinishedDebriefAt` = max `completed_at` over ALL of the pilot's rows for the lesson, legacy ones included. A pilot with only old below-par attempts therefore gets their fresh first attempt 6 h after their last one (spec, existing pilots);
    - `hasOpenDebrief` = an unfinished row of that format exists;
    - `chunksCleared` = count of mastery rows with `cleared_at` not null for the lesson's **current** chunk version;
    - `chunksTotal` = the length of `lesson_knowledge_chunks.chunks`.

    Remove `lastFailedDebriefAt` and `videoRewatchedAt`. Qualify every outer column with `outerRef`.
  - `coursePercent` debrief item = `masteryPercent(...)` instead of `passed ? 100 : 0`.

- [ ] **Step 1: Write the failing tests.**
  - `coursePercent` with one lesson at 100 and one bearing debrief at 5/7 not passed → the item list passed to the mean includes `71`.
  - `computeLessonRing` with passed → badge `'passed'`.
  - `computeLessonRing` with `retake-waiting` → badge `'debrief'` (unchanged meaning).
  - The rendered rollup SQL, in a single-table select, has `"lessons"."id"` in each new subquery.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/db src/lib src/components/sidebar` and `pnpm tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(debrief): course and ring progress read chunk mastery`.

### Task 8: Answer box — no paste, metrics, autosave

**Files:**
- Create: `src/hooks/use-answer-metrics.ts`, `src/data-hooks/use-debrief-attempt.ts`
- Modify: `src/components/lesson-material/parts/question-card.tsx`, `src/atoms/lesson-ai-test.ts`
- Test: `src/components/lesson-material/parts/__tests__/question-card.test.tsx`, `src/hooks/__tests__/answer-metrics.test.ts`

**Interfaces:**
- **Consumes:** the Task 6 routes and `AnswerMetrics`.
- **Produces:**
  - `useStartDebrief({ courseSlug, lessonSlug })`, a query keyed `dataKeys.debriefAttempt(lessonSlug)` with `staleTime 0`.
  - `useAnswerDebrief()`, a mutation that on success sets the attempt query data and invalidates course progress + debrief status.
  - `useSaveDebriefDraft()`, a mutation debounced by 800 ms in the container via a ref timer, not state.
  - Pure `reduceAnswerMetrics(prev: AnswerMetrics, event: MetricsEvent): AnswerMetrics`, where `MetricsEvent` = `keydown|input{deltaRemoved}|paste-blocked|visibility{hidden, at}|submit{at, length}`. The hook holds it in a ref.
  - A rewrite counts when more than half of the longest length so far is deleted in one run.
  - `QuestionCard` props add `pasteBlockedNote: boolean`, `onBlockedPaste(): void`, `onAnswerEvent(e): void`. The textarea:
    - `onPaste`/`onDrop`/`onCopy`/`onCut` → `preventDefault()` + `onBlockedPaste()`;
    - the note (exact copy from Global Constraints) appears under the field, `aria-live="polite"`, and is referenced by `aria-describedby`;
    - copying the question text stays allowed;
    - the MCQ input and `debriefSetsProgress` references are removed.

- [ ] **Step 1: Write the failing tests.**
  - Firing `paste` on the textarea → `defaultPrevented === true`, the `onBlockedPaste` stub is called once, and the textarea value is unchanged.
  - With `pasteBlockedNote` true, the field's `aria-describedby` points at an element whose text is the exact note.
  - Reducer: typing 40 chars then deleting 25 in one run → `rewrites 1`, `charsDeleted 25`.
  - Two hidden spans of 3 s → `msHidden 6000`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(debrief): typed answers only, answer metrics, draft autosave`.

### Task 9: Debrief tab — attempt flow, report, countdown

**Files:**
- Modify: `src/components/lesson-material/parts/debrief-quiz-container.tsx`, `debrief-panel-container.tsx`, `src/components/lesson-material/compute-debrief-panel.ts`, `debrief-wait.tsx`, `score-report.tsx`, `debrief-intro.tsx`, `src/data-hooks/use-debrief-status.ts`, `src/routes/api/lesson/debrief-status.ts`
- Create: `src/components/lesson-material/parts/debrief-countdown.tsx` (presentational), `src/lib/format-countdown.ts`
- Delete: `debrief-save.ts`, `should-auto-save-debrief.ts`, `debrief-session-owner.ts`, `evaluation-card.tsx` if unused, and their tests (the server now owns saving)
- Test: `src/lib/__tests__/format-countdown.test.ts`, `compute-debrief-panel.test.ts`, `debrief-wait.test.tsx`, `score-report.test.tsx`

**Interfaces:**
- **Consumes:** Task 6 hooks and responses; Task 2 states.
- **Produces:**
  - `formatCountdown(msLeft: number): string`:
    - `'5 h 40 min'` at 5 h 40 m;
    - `'40 min'` under an hour;
    - `'45 s'` under a minute;
    - `'0 s'` at or below 0;
    - minutes round **up**, so the display never shows less time than remains.
  - The container ticks with a ref interval, every 60 s, or every 1 s under a minute, writing the remaining ms to a jotai atom. At zero it calls `refetch()`. A `retake-waiting` response re-arms the tick. **(Review Focus 4)**
  - `DebriefCountdown({ countdown: string; clockTime: ReactNode })` renders the heading `Your next debrief opens in {countdown}` with `aria-live="off"`, plus the clock time below. A visually hidden `role="status"` sentence is set once on mount and once on opening.
  - `ScoreReport` props: `{ mastery: { cleared; total; percent; passed }; revisitNotes: string[] }`:
    - the ScoreRing shows `percent`;
    - the line reads `{cleared} of {total} knowledge chunks cleared`;
    - "Worth revisiting" renders each note as its own paragraph, not a list of names;
    - when passed, it shows 100 and no list.
  - The panel resumes an open attempt at the first unanswered question and pre-fills the draft.

- [ ] **Step 1: Write the failing tests.**
  - `formatCountdown(20_400_000) === '5 h 40 min'`
  - `formatCountdown(2_399_000) === '40 min'`
  - `formatCountdown(45_000) === '45 s'`
  - `ScoreReport` with mastery 5/7 → ring prop `71`, the exact cleared line, and two `<p>` revisit notes with the given text.
  - `computeDebriefPanel` with `retake-waiting` → kind `retake-waiting` carrying `availableAt`.
  - `DebriefWait` retake → the heading text starts `Your next debrief opens in`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/components/lesson-material src/lib` and `pnpm tsc --noEmit`. Expected: PASS, tsc clean across the repo.
- [ ] **Step 5: Commit** with message `feat(debrief): resumable chunk debrief UI, mastery report, live retake countdown`.

### Task 10: Viper reads revisit notes

**Files:**
- Modify: `src/lib/debrief-gaps.ts`, `src/db/debrief-gaps.ts`, `src/ai/prompts/viper7.ts` (only where it formats gaps)
- Test: `src/lib/__tests__/debrief-gaps.test.ts`, the viper prompt test

**Interfaces:**
- **Produces:** `debriefGaps(evaluations)` returns `{ notes: string[]; incorrect: string[] }`. Notes are each answer's non-empty `revisitNote`, deduped. Legacy `essentialIdeas` are mapped as before into `notes` for old rows. `recentLessonGaps` is unchanged in selection, still reading each lesson's latest finished attempt.

- [ ] **Step 1: Write the failing test.** The Viper prompt builder, given one lesson's gaps with a note, includes that note's exact text under the lesson name. Assert on the built prompt string.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/lib src/ai`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(debrief): Viper teaches to the same revisit notes`.

### Task 11: Rollout

**Files:**
- Create: `docs/superpowers/rollouts/2026-11-12-debrief-knowledge-chunks.md`

- [ ] **Step 1: Full suite.** Run `pnpm vitest run`, `pnpm tsc --noEmit` and `pnpm biome check src`. Expected: all green.
- [ ] **Step 2: Local run against a dev DB.** Run `pnpm db:migrate-knowledge-chunks` twice; the second run is a no-op. Then on port 5001:
  - take a debrief on a video lesson to 100% across two attempts;
  - confirm the 6 h countdown appears;
  - confirm paste is blocked;
  - confirm a reload mid-attempt resumes with the draft;
  - confirm the course percent shows the mastery item.
- [ ] **Step 3: Write the rollout note.** The order is:
  1. prod `pnpm db:migrate-knowledge-chunks` (read the legacy-pass count it prints first);
  2. deploy;
  3. spot-check one pilot's lesson ring.

  No `db:push`. Commit the note.
- [ ] **Step 4: Commit** with message `docs(debrief): rollout order for knowledge chunks`.
