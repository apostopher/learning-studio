# Debrief RGS Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Judge each debrief set on the lesson's total score (video + quiz + debrief, ring weights) against a per-course pass mark, with the stakeholder doc's flow: optional improve set after a pass, set 2 after a miss, and Now/Later instead of a 6-hour retake wait.

**Architecture:** A pure `lessonTotalScore` (client-safe) does the weighting. The set rules in `debrief-sets.ts` take a judge function instead of the fixed 75. The server builds that judge from the lesson's video and quiz fractions plus the course's `pass_mark`. `debrief_passes` stays the only record of "passed". The quiz route re-checks the pass after every save.

**Tech Stack:** TanStack Start (file routes with `server.handlers`), Drizzle + Postgres, zod, TanStack Query, jotai, react-hook-form, Base UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-debrief-rgs-scoring-design.md`

## Global Constraints

- Total score is out of 100. Weights:
  - Video, when present (`hasVideo && needsVideoWatch`): 50.
  - Quiz and debrief, when present, share the remainder equally (50, or 100 with no video).
  - One part alone: 100.
  - No parts: auto pass (total 100, passed).
- Fractions:
  - Video = `min(watchedHits, WATCHED_TOTAL) / WATCHED_TOTAL`.
  - Quiz = correct / questions in the LATEST attempt (`userOptionId === correctOptionId`); 0 when never taken. Never assume 5 questions.
  - Debrief = better set average / 100.
- When judging a debrief set, the debrief part is ALWAYS present, even when the lesson's debrief is optional (spec: "judged as if the debrief counted").
- Pass: `total >= passMark`, compared unrounded. Display one decimal.
- `courses.pass_mark integer not null default 85`, check `0 <= pass_mark <= 100`. Default constant: `DEFAULT_PASS_MARK = 85`.
- The attempt is judged against the pass mark of the course in the request (`courseId` from `getDebriefAccess` / the lesson gate).
- `debrief_passes` is the ONLY "passed" record, and it is final. Never delete a pass.
- `DEBRIEF_ATTEMPT_FORMAT` must NOT be bumped: the one-open-attempt index literal depends on it.
- Copy, verbatim:
  - `DEBRIEF_PASS_OFFER_COPY` = "That's great. Based on these answers you've met or exceeded the standard for this knowledge chunk. You can still try to improve your score by answering four more questions from different KEYS. It will only affect your score if you do better". When set 2 has n ≠ 4 questions, replace "four" with the number word for n.
  - `DEBRIEF_DECLINE_COPY` = "Okay that's fine. Just proceed to the next video."
  - `DEBRIEF_SET1_MISSED_COPY` = "Let's try some of the other teaching points"
  - `DEBRIEF_TWO_MISSED_COPY` = "Not quite there yet. Study the KEYS or rewatch the video, or both, then retake the debrief. You can do it now or any time before the end of your training."
  - Buttons: "Yes" / "No" for the offer, "Retake now" / "Later" after two misses.
- The 6-hour retake wait is removed. The 12h first-debrief wait is unchanged.
- **Database safety:**
  - `.env.local` is the PRODUCTION database. Never run a migration or a dev server against it.
  - Never `db:push`.
  - Never `drizzle-kit generate`.
  - Never `biome format --write src`.
- **Repo rules:**
  - Presentational and container split (`foo.tsx` / `foo-container.tsx`).
  - jotai for client state (no `useState`).
  - TanStack Query hooks in `src/data-hooks`.
  - react-hook-form + zod for forms.
  - Base UI components.
  - Logical CSS properties.
  - Semantic colour tokens only.
- **Tests and imports:**
  - Vitest imports use `#/`, not `@/`.
  - Tests assert on what the consumer received (mock call args), not on stored state.
- Commands, all run from the repo root:
  - `pnpm vitest run <path>`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome check <changed files>`

## Review Focus

1. **A quiz retaken worse after a pass.** The pass must stay (passes are final); nothing un-passes.
2. **Set 1 passes on a lesson with only 4 key points (no set 2).** The attempt finishes `set-passed` with no offer, and the learner is never stuck on a Yes/No that leads nowhere.
3. **A learner closes the tab on the Yes/No offer.** On return, the Debrief tab shows the offer again (not "passed" with no way back, not a fresh attempt). The ring shows the passed badge meanwhile.
4. **Quiz saved when the lesson has no finished debrief set.** No pass is recorded. Debrief fraction 0 must not pass a lesson through video + quiz alone, even if that total is ≥ the pass mark.
5. **Two answers race on the completing question of set 1.** Only one pass insert and one offer; the loser returns the stored result with the same `offer`.

Each of these has a test in the owning task (Tasks 2, 4, 5, 6).

---

### Task 1: `courses.pass_mark` column, migration script, admin read/write

**Files:**
- Modify: `src/db/schema.ts` (coursesTable): add `passMark: integer('pass_mark').notNull().default(85)` and the check `courses_pass_mark_check` (`pass_mark between 0 and 100`) in the table extras.
- Create: `src/db/migrate-pass-mark.ts`, modelled on `src/db/migrate-doc-source.ts`.
  - Exports `PASS_MARK_STATEMENTS`:
    - `alter table "courses" add column if not exists "pass_mark" integer not null default 85`
    - add constraint `courses_pass_mark_check` guarded by `pg_constraint` lookup.
  - Runs them in one transaction and prints `courses.pass_mark is in place.`
- Modify: `package.json`: `"db:migrate-pass-mark": "dotenv -e .env.local -- tsx src/db/migrate-pass-mark.ts"`.
- Create: `src/lib/pass-mark.ts`: `export const DEFAULT_PASS_MARK = 85;` and `export const PassMarkSchema = z.number().int().min(0).max(100);`.
- Modify: `src/lib/admin-schemas.ts`: `adminCourseSummarySchema` gains `passMark: z.number()`; new `updatePassMarkInputSchema = z.object({ passMark: PassMarkSchema })`.
- Modify: the `listAdminCourses` query, wherever it lives (grep), so it selects `passMark`.
- Create: `src/routes/api/admin/courses.$courseId.pass-mark.ts`, a `PUT` handler `putPassMarkHandler(request, courseIdRaw)`.
  - Uses the same guard as `courses.$courseId.ts` PATCH (`guard(request, 'update')`; copy its pattern).
  - 400 on bad id or body, 404 when no row was updated.
  - Returns `{ passMark }`.
  - Writes through a new `updateCoursePassMark(courseId: number, passMark: number): Promise<boolean>` in `src/db/course.ts`.
  - After the write, invalidate the same course caches `updateCourse` invalidates (read it).
- Create: `src/data-hooks/use-update-pass-mark.ts`: `useUpdatePassMark()`, a mutation with `{ courseId, passMark }` that PUTs and on success invalidates the admin-courses query key used by `useAdminCourses`.
- Test: `src/db/__tests__/migrate-pass-mark.test.ts` (copy `migrate-doc-source.test.ts`'s approach), `src/routes/api/admin/__tests__/courses-pass-mark.test.ts`.

**Interfaces:**
- Produces:
  - `DEFAULT_PASS_MARK`, `PassMarkSchema` (`#/lib/pass-mark`)
  - `coursesTable.passMark`
  - `updateCoursePassMark`
  - `useUpdatePassMark`
  - `AdminCourseSummary.passMark`

- [ ] **Step 1: Write failing tests**
  - Migration test: the statements render SQL containing `add column if not exists "pass_mark" integer not null default 85`, and the constraint name `courses_pass_mark_check`.
  - Route test (mock `#/db/course` and the guard as the existing admin route tests do):
    - `PUT` `{ passMark: 90 }` calls `updateCoursePassMark` with `(7, 90)` for `courseId '7'`, and returns 200 `{ passMark: 90 }`.
    - `{ passMark: 101 }` returns 400 and `updateCoursePassMark` is not called.
    - A forbidden guard returns 403 and makes no call.
    - `updateCoursePassMark` resolving false returns 404.
- [ ] **Step 2: Run them and see them fail**
  - Run: `pnpm vitest run src/db/__tests__/migrate-pass-mark.test.ts src/routes/api/admin/__tests__/courses-pass-mark.test.ts`
  - Expected: FAIL (modules not found).
- [ ] **Step 3: Implement the files above.** Run `pnpm exec tsc --noEmit`; fix every caller the new non-null column breaks (course inserts get the DB default, so most need nothing).
- [ ] **Step 4: Run the tests again.** Expected: PASS. Then `pnpm vitest run src/db src/routes/api/admin`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(courses): pass_mark column, migration script and admin endpoint`

---

### Task 2: Pure total score and the set rules with a judge

**Files:**
- Create: `src/lib/lesson-score.ts`
- Modify: `src/lib/debrief-sets.ts`
- Modify: `src/lib/client-debrief-attempt.ts` (`toClientAttempt` must not need a judge)
- Test: `src/lib/__tests__/lesson-score.test.ts`, `src/lib/__tests__/debrief-sets.test.ts` (existing; update)

**Interfaces:**
- Produces, in `#/lib/lesson-score`:
  ```ts
  export type ScorePartName = 'video' | 'quiz' | 'debrief';
  /** 0..1 per part; null = the lesson does not have that part. */
  export type ScoreFractions = Record<ScorePartName, number | null>;
  export type ScorePart = { part: ScorePartName; weight: number; fraction: number; points: number };
  export type LessonScore = { total: number; passMark: number; passed: boolean; parts: ScorePart[] };
  export function lessonTotalScore(f: ScoreFractions, passMark: number): LessonScore;
  export function formatScore(n: number): string; // one decimal, "85.5"; whole numbers without ".0" ("50")
  ```
  `parts` are in the order video, quiz, debrief, present parts only.
- Produces, in `#/lib/debrief-sets` (replacing `DEBRIEF_SET_PASS_SCORE` in the set logic):
  ```ts
  export type SetJudge = (average: number) => boolean;
  export function completedSetAverages(sets, scoreOf): number[]; // judge-free: averages of fully answered sets, in order, stopping at the first incomplete
  export type SetOutcome = { set: number; average: number; passed: boolean };
  export type SetsProgress = {
    completed: SetOutcome[];
    reached: number;
    passed: boolean;        // some completed set passed
    best: number | null;    // max completed average
    offer: boolean;         // set 1 passed, a set 2 exists, not yet accepted
    over: boolean;          // nothing more to ask (declining is recorded by the caller finishing the row)
  };
  export function setsProgress(sets, scoreOf, judge: SetJudge, opts: { improveAccepted: boolean }): SetsProgress;
  ```
  - A completed set's `passed` = `judge(max(average of this set, every earlier completed set))`. That is the better set so far.
  - `reached`:
    - Set 1 missed: the next set opens.
    - Set 1 passed and `improveAccepted`: set 2 opens.
    - Set 1 passed and not accepted: stays 1.
  - `over`: true when every reached set is complete AND no further set may open (all sets done, or passed with no set 2).
  - `answerVerdict` keeps its thresholds (85 / 75 / 40). `DEBRIEF_SET_PASS_SCORE` stays exported only if still referenced; otherwise delete it.

- [ ] **Step 1: Write failing tests (`lesson-score.test.ts`)**
  ```ts
  it('doc example, set 1: video 1, quiz 4/5, debrief 51.5 -> 82.9 fails at 85', () => {
    const s = lessonTotalScore({ video: 1, quiz: 0.8, debrief: 0.515 }, 85);
    expect(s.total).toBeCloseTo(82.875, 3);
    expect(s.passed).toBe(false);
    expect(s.parts.map((p) => [p.part, p.weight])).toEqual([['video', 50], ['quiz', 25], ['debrief', 25]]);
  });
  it('doc example, set 2: 60.5 + full quiz -> 90.1 passes', () => {
    expect(lessonTotalScore({ video: 1, quiz: 1, debrief: 0.605 }, 85).passed).toBe(true);
  });
  it('no quiz: video 50 + debrief 50', /* weights [['video',50],['debrief',50]] */);
  it('no video: quiz 50 + debrief 50');
  it('no debrief: video 50 + quiz 50');
  it('one part: weight 100');
  it('no parts: auto pass, total 100, parts []');
  it('quiz with 3 questions, 2 right: fraction 2/3 weighs its share evenly'); // video+quiz+debrief: quiz points = 25*2/3
  it('compares unrounded: 84.96 does not pass at 85');
  it('formatScore: 82.875 -> "82.9", 50 -> "50"');
  ```
- [ ] **Step 2: Write failing tests (`debrief-sets.test.ts`)**, with `judge = (avg) => avg >= 60`:
  - Set 1 averages 70: `completed[0].passed`, `offer: true`, `reached: 1`, `over: false`.
  - Same with `improveAccepted: true`: `reached: 2`, `offer: false`.
  - Accepted, set 2 averages 40: `completed[1].passed === true` (better set 70 counts), `best: 70`, `over: true`.
  - Set 1 averages 50: `reached: 2`, `offer: false`. Set 2 averages 55: `passed: false`, `over: true`, `best: 55`.
  - Only one set, which passed: `offer: false`, `over: true` (Review Focus 2).
  - `completedSetAverages` ignores a half-answered set.
  - Replace or remove the old fixed-75 tests.
- [ ] **Step 3: Run them and see them fail.** Run: `pnpm vitest run src/lib/__tests__/lesson-score.test.ts src/lib/__tests__/debrief-sets.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - Weighting rule: `video` (if not null) gets 50; the remaining present parts split `(video ? 50 : 100)` equally; `points = weight * fraction`; `total = Σ points`.
  - Then update `toClientAttempt`:
    - `questions`: keep those in sets that have at least one answered question, plus set 1 always.
    - `setAverages`: from `completedSetAverages`.
  - Fix every `setsProgress` caller that `tsc` flags. The server caller is rewritten in Task 4, so there, pass a temporary judge `(a) => a >= 75` with `improveAccepted: stored.improveAccepted ?? false` and leave a `// Task 4` marker.
  - Add `improveAccepted: z.boolean().optional()` to `StoredAttemptSchema` in `src/lib/debrief-attempt-snapshot.ts`.
- [ ] **Step 5: Run the tests again.** Run: `pnpm vitest run src/lib && pnpm exec tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 6: Commit**: `feat(debrief): total score with ring weights; sets judged by a judge function`

---

### Task 3: Remove the 6-hour retake wait

**Files:**
- Modify: `src/lib/debrief-schedule.ts`:
  - Delete `DEBRIEF_RETAKE_DELAY_MS` and the `retake-waiting` state.
  - The open variant becomes `{ kind: 'open'; retake: boolean; resume: boolean; passed: boolean }`.
  - `computeDebriefState`:
    - An open attempt wins first: `{ kind: 'open', retake, resume: true, passed: facts.passed }`, so a pending offer can be resumed after a pass.
    - Then passed gives `passed`.
    - Then a finished unpassed attempt gives `open`, retake, immediately.
    - Then the 12h clock as today.
  - `debriefBadge`: open + passed gives `'passed'`.
- Modify every reader of `retake-waiting` / `DEBRIEF_RETAKE_DELAY_MS` (`grep -rn "retake-waiting\|DEBRIEF_RETAKE_DELAY_MS" src`):
  - `src/components/sidebar/compute-lesson-ring.ts`
  - `src/lib/debrief-not-open.ts`
  - `src/components/lesson-material/compute-debrief-panel.ts`
  - `src/components/lesson-material/parts/debrief-wait.tsx`
  - the debrief-status route
  - their tests and stories
  - Drop the branches. `finished` panels get `availableAt: null`.
- Test: `src/lib/__tests__/debrief-schedule.test.ts` and the readers' tests.

**Interfaces:**
- Produces: `DebriefState` without `retake-waiting`; `open.passed`.

- [ ] **Step 1: Write failing tests**
  - A finished unpassed attempt 1 minute ago gives `{ kind: 'open', retake: true, resume: false, passed: false }`.
  - An open attempt with `passed: true` gives `{ kind: 'open', resume: true, passed: true }`, and `debriefBadge` of it is `'passed'`.
  - Passed with no open attempt gives `passed`.
  - The 12h waiting case is unchanged.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm vitest run src/lib/__tests__/debrief-schedule.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then `pnpm exec tsc --noEmit` and fix every reader.
- [ ] **Step 4: Run the tests again.** Run: `pnpm vitest run src/lib src/components/sidebar src/components/lesson-material src/routes/api/lesson`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(debrief): no retake wait; an open attempt resumes even after a pass`

---

### Task 4: Server judging, the offer, and the continue endpoint

**Files:**
- Create: `src/lib/lesson-score.server.ts`:
  ```ts
  /** Video and quiz fractions for this pilot and lesson, by the ring's rules; null = lesson lacks it. */
  export async function getScoreFacts(userId: string, lessonSlug: string, lessonId: number): Promise<{ video: number | null; quiz: number | null }>;
  export async function getCoursePassMark(courseId: number): Promise<number>; // DEFAULT_PASS_MARK when no row
  export function debriefJudge(facts: { video: number | null; quiz: number | null }, passMark: number): SetJudge; // avg -> lessonTotalScore({...facts, debrief: avg/100}, passMark).passed
  export function setScore(facts, passMark, average: number): LessonScore;
  ```
  - The video fraction uses the same definitions as the ring:
    - `hasVideo` = `videoProvider` and `videoRef` both non-null.
    - `needsVideoWatch`.
    - Distinct `watchedMilestones` hits in `video_progress`.
  - The quiz fraction:
    - Present when the lesson material's quiz has ≥ 1 question (the `hasQuiz` SQL in `progress-components.ts`; export it as `hasQuizSql` rather than duplicating it).
    - Value from `getLatestLessonQuizAnswers`.
- Modify: `src/lib/debrief-attempt.server.ts`
  - `answerQuestion`:
    - Before the transaction, load `getScoreFacts` + `getCoursePassMark(a.courseId)` and build the judge.
    - Use `setsProgress(sets, scores, judge, { improveAccepted })` in `setStep` and `toView`.
    - A completed set that passes inserts the pass (`insertPass`, idempotent) in the same transaction.
    - The attempt finishes only when `over`, with `totalScore = best` and `finishedReason` `set-passed` if `passed`, else `sets-missed`.
    - Set 1 passing with a set 2 leaves the attempt open with `offer: true`.
  - `AnswerResult` ok-shape becomes:
    ```ts
    { ok: true;
      evaluation: { score: number; feedback: string; revisitNote: string };
      setResult: (SetOutcome & { score: LessonScore }) | null; // score uses the better set so far
      nextQuestions: ClientQuestion[];
      offer: boolean;          // set 1 just passed and set 2 may be offered
      passedNow: boolean;      // this answer recorded the pass
      finished: null | 'set-passed' | 'sets-missed'; }
    ```
    - `storedResult` (the replay path) must rebuild the same `offer` / `setResult` from stored data (Review Focus 5).
    - `passedNow` on a replay is false.
  - `AttemptView` gains `offer: boolean` (resume shows the offer again; Review Focus 3) and `setResults: (SetOutcome & { score: LessonScore })[]`.
  - New:
    ```ts
    export type ContinueResult =
      | { ok: true; choice: 'yes'; questions: ClientQuestion[] }
      | { ok: true; choice: 'no' }
      | { ok: false; reason: 'forbidden' | 'no-offer' };
    export async function continueAttempt(a: { userId: string; attemptId: number; choice: 'yes' | 'no'; lessonId: number; courseId: number }): Promise<ContinueResult>;
    ```
    - Locks the row and recomputes progress. It must be the pilot's open chunk attempt with `offer === true`, else `no-offer`.
    - `yes` writes `questions: { ...stored, improveAccepted: true }` and returns set 2's client questions.
    - `no` finishes the row: `completedAt: now`, `finishedReason: 'set-passed'`, `totalScore: best`.
    - `updateAttempt` in `src/db/debrief-attempts.ts` must accept `questions`.
- Create: `src/routes/api/lesson/debrief/continue.ts`: `POST { courseSlug, attemptId, choice: 'yes'|'no' }`. It uses the same owner and `getDebriefAccess` checks as `answer.ts`; `no-offer` → 409.
- Modify: `src/routes/api/lesson/debrief/answer.ts`: call `settleProgress` when `result.finished || result.passedNow`.
- Test:
  - `src/lib/__tests__/debrief-attempt.test.ts` (existing; extend)
  - `src/lib/__tests__/lesson-score.server.test.ts`
  - `src/routes/api/lesson/debrief/__tests__/debrief-routes.test.ts`

**Interfaces:**
- Consumes: Task 1 `coursesTable.passMark`, `DEFAULT_PASS_MARK`. Task 2 `lessonTotalScore`, `setsProgress`, `SetJudge`, `LessonScore`, `StoredAttempt.improveAccepted`.
- Produces: `AnswerResult` (above), `AttemptView.offer`, `AttemptView.setResults`, `continueAttempt`, `POST /api/lesson/debrief/continue`, `getScoreFacts`, `getCoursePassMark`, `debriefJudge`, `setScore`.

- [ ] **Step 1: Write failing tests**, mocking `#/db/debrief-attempts`, the grader and `lesson-score.server` loaders as the existing tests do. Facts are `{ video: 1, quiz: 1 }` and the pass mark 85, so a set passes at average ≥ 40.
  - Set 1 completing at average 50, with 8 questions:
    - `insertPass` is called once with the user and lesson.
    - `updateAttempt` is NOT called with `completedAt`.
    - The result has `offer: true`, `passedNow: true`, `finished: null`, and `setResult.score.total` close to 87.5.
  - The same, with only 4 questions: `updateAttempt` is called with `completedAt`, `finishedReason: 'set-passed'`, `totalScore: 50`; `offer: false`.
  - Set 1 at average 30: no `insertPass`; `nextQuestions` holds set 2; `offer: false`.
  - Set 2 at 35 after set 1 at 30: `finishedReason: 'sets-missed'`, `totalScore: 35`, and `prepareDebrief` is scheduled.
  - Quiz facts `{ video: 1, quiz: 0 }` (not taken), set average 60: total 65, not passed.
  - Replay of the completing answer: returns `offer: true`, `passedNow: false`, and makes no second `insertPass` call.
  - `continueAttempt`:
    - `yes`: `updateAttempt` is called with `questions` containing `improveAccepted: true`, and set 2's questions are returned.
    - `no`: called with `completedAt` and `finishedReason: 'set-passed'`.
    - With no offer: `no-offer`.
  - `toView` of an open attempt whose set 1 passed and is not accepted: `offer: true`, and only set 1's questions are in it.
  - Route: `continue` with `no-offer` → 409. `answer` with `passedNow: true, finished: null` → `settleProgress` is called.
  - `getScoreFacts`: video null when `needsVideoWatch` is false; quiz 2/3 from a latest attempt with 3 answers, 2 correct; quiz 0 when the lesson has a quiz and none was taken.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm vitest run src/lib/__tests__/debrief-attempt.test.ts src/lib/__tests__/lesson-score.server.test.ts src/routes/api/lesson/debrief`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove Task 2's temporary judge.
- [ ] **Step 4: Run the tests again.** Run: `pnpm vitest run src/lib src/routes/api/lesson && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(debrief): judge sets on the lesson total vs the course pass mark; improve-set offer`

---

### Task 5: The quiz can complete a debrief

**Files:**
- Modify: `src/lib/debrief-attempt.server.ts`: add
  ```ts
  /** After a quiz save: record the pass if the best completed set so far, plus the current video and quiz, reaches the course pass mark. True when it recorded one. */
  export async function recheckDebriefPass(a: { userId: string; lessonSlug: string; lessonId: number; courseId: number }): Promise<boolean>;
  ```
  - Best = max of `completedSetAverages` over every chunk-format attempt of this pilot on the lesson (finished or open).
  - No completed set → no pass (Review Focus 4).
  - Already passed → nothing.
  - Add a db helper `selectChunkAttempts(userId, lessonSlug)` in `src/db/debrief-attempts.ts`.
- Modify: `src/routes/api/lesson/quiz/answers.ts`: after `saveLessonQuizAnswers` and BEFORE `settleProgress`, `await recheckDebriefPass({ userId, lessonSlug, lessonId, courseId: gate.courseId })`, with `lessonId` from the gate (see `LessonGateResult`). A recheck failure is logged and does not fail the save.
- Test: `src/lib/__tests__/debrief-attempt.test.ts`, `src/routes/api/lesson/quiz/__tests__/answers.test.ts` (existing).

**Interfaces:**
- Consumes: Task 4 `getScoreFacts`, `getCoursePassMark`, `debriefJudge`. Task 2 `completedSetAverages`.
- Produces: `recheckDebriefPass`.

- [ ] **Step 1: Write failing tests**
  - A best set of 50 with facts `{ video: 1, quiz: 1 }` and pass mark 85 → `insertPass` is called and the function returns true.
  - The same with quiz 0.6: total 77.5 → no insert.
  - No completed set → no insert, even with video 1 and quiz 1.
  - Already passed → no insert.
  - Quiz route: `recheckDebriefPass` is called with the gate's `courseId` and `lessonId`, before `settleProgress` (check the mock call order). When it throws, the route still returns 200.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm vitest run src/lib/__tests__/debrief-attempt.test.ts src/routes/api/lesson/quiz`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Run the same command. Expected: PASS. Then `pnpm exec tsc --noEmit`.
- [ ] **Step 5: Commit**: `feat(debrief): a corrected quiz can complete the debrief`

---

### Task 6: Debrief tab: score breakdown, offer, set-2 and Now/Later prompts

**Files:**
- Modify:
  - `src/lib/debrief-copy.ts` (create if absent) holds the five copy constants from Global Constraints, plus `passOfferCopy(set2Count: number): string`.
  - `src/data-hooks/` debrief attempt hooks: add `useContinueDebrief()` (a mutation to `/api/lesson/debrief/continue`), and extend the answer and start response zod schemas with `offer`, `passedNow`, `setResult.score`, `setResults`.
  - `src/components/lesson-material/compute-debrief-panel.ts` and `parts/debrief-quiz-container.tsx`: the flow below.
  - `parts/debrief-feedback.tsx` / `parts/score-report.tsx`: render the breakdown.
- Create: `parts/debrief-score-breakdown.tsx`, presentational. Props: `{ score: LessonScore }`. Renders "Video 50 + Quiz 20 + Debrief 12.9 = 82.9 · pass mark 85" with `formatScore`. When the quiz part has fraction 0, it adds "Quiz not taken yet — taking it adds up to {weight} points." only if the quiz was never taken; for the "never taken" signal, pass `quizTaken: boolean` from the container.
- Flow (the container holds this state in jotai atoms, not `useState`):
  - **A set completes and passes with `offer: true`:**
    - Show the breakdown, then `passOfferCopy(n)` with Yes / No.
    - Yes → `useContinueDebrief('yes')`, which appends set 2's questions and continues.
    - No → `'no'`, then show `DEBRIEF_DECLINE_COPY` and the finished report.
  - **A set completes and misses, with `nextQuestions`:** show the breakdown and `DEBRIEF_SET1_MISSED_COPY`, then set 2. Replace the old "Start set 2" label logic in `feedbackNextLabel` accordingly.
  - **`finished: 'sets-missed'`:** show the breakdown (better set), `DEBRIEF_TWO_MISSED_COPY`, "Retake now" (calls start, which is now immediately open) and "Later" (closes to the finished report; the ring's red D stays).
  - **Resume (`AttemptView.offer` true):** open straight on the offer.
  - **The panel when state is `open` with `passed: true`:** it is the take/resume panel, not the passed history.
- Test:
  - `src/components/lesson-material/__tests__/compute-debrief-panel.test.ts`
  - `parts/__tests__/debrief-score-breakdown.test.tsx` (hookless render, per the repo's render-test constraints)
  - `src/lib/__tests__/debrief-copy.test.ts`

**Interfaces:**
- Consumes: Task 4's `AnswerResult`, `AttemptView`, `POST /api/lesson/debrief/continue`; Task 2's `LessonScore`, `formatScore`; Task 3's `open.passed`.

- [ ] **Step 1: Write failing tests**
  - `passOfferCopy(4)` equals `DEBRIEF_PASS_OFFER_COPY`; `passOfferCopy(2)` contains "answering two more questions".
  - The breakdown renders the text "Video 50 + Quiz 20 + Debrief 12.9 = 82.9 · pass mark 85" for `lessonTotalScore({ video: 1, quiz: 0.8, debrief: 0.515 }, 85)`.
  - `computeDebriefPanel`, with status `open` + `passed: true` + `resume: true`, gives a `take` panel with `resume: true`.
  - `feedbackNextLabel`:
    - A missed set with a next set → `DEBRIEF_SET1_MISSED_COPY`.
    - A passed set with `offer` → "Continue".
    - `finished` → "See your result".
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm vitest run src/components/lesson-material src/lib/__tests__/debrief-copy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update stories touched by changed props.
- [ ] **Step 4: Run the tests again.** Run the same command, then `pnpm exec tsc --noEmit && pnpm exec biome check src/components/lesson-material src/lib src/data-hooks`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(debrief): score breakdown, improve offer and Now/Later on the Debrief tab`

---

### Task 7: Pass mark on the Schedule tab

**Files:**
- Create: `src/components/admin/schedule/course-pass-mark.tsx` (presentational) and `course-pass-mark-container.tsx`.
  - The control shows "Pass mark 85" as a small button next to the course name.
  - It opens a Base UI Popover with a react-hook-form + zod (`PassMarkSchema`) number field, Save and Cancel.
  - It submits through `useUpdatePassMark`.
  - Errors appear inline; the Save button shows pending while saving.
  - Accessible name: "Pass mark for {course name}, currently {n}".
- Modify:
  - `schedule-course-card.tsx`: accepts a `passMarkSlot?: ReactNode` rendered OUTSIDE the drag-handle spread. Pointer and keyboard events on it must not start a drag: render it as a sibling wrapped so `dragHandleProps` doesn't cover it, and stop propagation of `onPointerDown` / `onKeyDown`.
  - `draggable-course-container.tsx`: passes `<CoursePassMarkContainer course={course} />`.
- Test: `src/components/admin/schedule/__tests__/course-pass-mark.test.tsx` (presentational, hookless) checks the button's accessible name text; container wiring is covered by Task 1's hook.

**Interfaces:**
- Consumes: Task 1's `AdminCourseSummary.passMark`, `useUpdatePassMark`, `PassMarkSchema`.

- [ ] **Step 1: Write the failing test**: rendering `CoursePassMark` with `{ courseName: 'ITPS UAS', passMark: 85 }` outputs "Pass mark 85" and an aria-label of "Pass mark for ITPS UAS, currently 85".
- [ ] **Step 2: Run it and see it fail.** Run: `pnpm vitest run src/components/admin/schedule`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Run the same command, then `pnpm exec tsc --noEmit && pnpm exec biome check src/components/admin/schedule`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(schedule): course managers set each course's pass mark`

---

## Rollout (after the final review)

1. User runs `pnpm db:migrate-pass-mark` on prod.
2. Merge and push.

Deploying before the migration breaks every `select().from(coursesTable)`, because Drizzle names `pass_mark`.
