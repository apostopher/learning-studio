# Debrief Spaced Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Debriefs open 24h after a lesson is done, need 70 to pass with fresh retakes every 24h; the quiz returns on every lesson; lesson progress excludes the debrief, course progress includes it; "done" (sticky, 100%) gates the next lesson with exact lock copy.

**Architecture:** A pure schedule module (`debrief-schedule.ts`) decides a debrief's state from three Postgres facts (sticky `doneAt`, passed?, last failed attempt time) and `now` — no stored clocks. A new `lesson_completions` table records `doneAt` once, written by a `settleProgress` step that runs after every progress write and replaces the bare `maybePromote` call. The pure progress aggregator gains per-lesson `done`, `outstanding` items and debrief facts; the pure gate switches from "video watched" to "done" and carries the outstanding items so every lock can say exactly what is missing. Prepared debriefs move from Redis to a `prepared_debriefs` table so they survive the wait.

**Tech Stack:** TanStack Start (file routes with `server.handlers`), Drizzle + Postgres, TanStack Query, jotai, Base UI Tabs, motion/react, date-fns 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-debrief-spaced-review-design.md` — read it first; numbered "calls" (1–14) are referenced below as *call N*.

## Global Constraints

- Par: `DEBRIEF_PAR_SCORE = 70` (pass is `totalScore >= 70`). Delay: `DEBRIEF_DELAY_MS = 24 * 60 * 60 * 1000`.
- `availableAt = max(doneAt, lastFailedAt) + 24h`; nothing is available after a pass.
- Never run `pnpm db:push` or `drizzle-kit generate`. DDL goes in a hand-written `src/db/migrate-*.ts` (pattern: `src/db/migrate-viper-context.ts`) plus a `db:migrate-*` script in `package.json`.
- Vitest resolves `#/`, not `@/`, in test files. Components that call hooks cannot render under Vitest — put every branch in a pure function and test that (pattern: `compute-material-tabs.ts`).
- Tests assert on what the consumer received (mock the collaborator, assert its call args). Each regression test must be seen red before the fix.
- Colours only from tokens: red = `error` palette (`bg-error`, `text-error`, `--color-error-*`); text on `bg-error` is `text-black` (white fails AA on red-9). D glyph must meet AA 4.5:1 against what it sits on.
- Logical CSS properties only (`ms-`/`pe-`/`start-`…). kebab-case filenames; presentational + `-container` split; jotai not useState; TanStack Query for fetching (`staleTime` set).
- Learner-facing time format: `EEE d MMM, h:mm a` (date-fns), plus ` yyyy` when the year differs from now; browser timezone; render only inside `ClientGate` (`src/components/client-gate.tsx`).
- Every locked/waiting state states why and what unlocks it, visibly and in the accessible name.
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TKQDE9HZPwibhAKfM9Xx4C
  ```

## Review Focus

1. **A pilot whose lesson tabs get a new tab added after they finished it.** Expect: next lesson stays unlocked and the debrief clock keeps running (sticky `doneAt`); the ring shows the lower live percent. → Task 5 test `settleProgress never deletes or rewrites a completion` + Task 6 test `gate reads done set, not percent`.
2. **Debrief opening while the page is open.** Expect: tab and ring flip at `availableAt` without reload. → Task 10 test on `msUntil(availableAt, now)` refetch delay (and clamp to ≥ 0, ≤ 2^31-1).
3. **A pilot who submits a debrief from a stale tab after it relocked** (two tabs, failed in one). Expect: save refused 409, no second attempt row. → Task 8 test `save refused when state is retake-waiting`.
4. **Transcript-sourced debrief whose captions SQL says "ready" but the transcript is too short** (`MIN_USEFUL_CHARS`). Expect: generate 422s and the course can still complete — course-done must not wait forever. → Task 3 makes `debriefBearing` require a successful prepare *or* material text; see Task 3 step notes and test.
5. **Timezone near midnight / other year.** Expect: correct local day and year shown. → Task 10 tests for `formatDebriefTime` across a year boundary.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/debrief-schedule.ts` (new) | par, delay, `computeDebriefState`, `debriefBadge` — pure | 1 |
| `src/db/schema.ts` | `lessonCompletionsTable`, `preparedDebriefsTable` | 2 |
| `src/db/migrate-debrief-review.ts` (new) | hand-written DDL | 2 |
| `src/lib/course-progress-agg.ts` | components without debrief, quiz always; `outstanding`; `done`; debrief facts; `coursePercent` | 3 |
| `src/db/progress-components.ts`, `src/db/course-progress.ts`, `src/db/course.ts` | SQL for section names, debrief facts, `doneAt` | 3 |
| `src/lib/settle-progress.server.ts` (new), `src/db/lesson-completions.ts` (new) | record `doneAt`, then promote | 4–5 |
| `src/routes/api/user/report-video-progress.ts`, `.../lesson-section.ts`, `src/routes/api/lesson/quiz/answers.ts`, `src/routes/api/lesson/material.ts`, `.../ai-test/save-results.ts` | call `settleProgress` | 5 |
| `src/lib/tier-completion.ts` | done + debrief passed | 5 |
| `src/lib/lesson-gating.ts`, `src/lib/lesson-gating-inputs.ts` + callers | gate on done, outstanding in locks | 6 |
| `src/lib/lock-copy.ts` (new) + lock UIs | exact lock sentence | 7 |
| `src/lib/prepared-debrief.server.ts`, `src/lib/debrief-access.server.ts` (new), ai-test routes, `src/db/lesson-test.ts` | Postgres prepared debriefs, state-gated generate/save, dev-user fix, retake prep | 8 |
| `src/routes/api/lesson/debrief-status.ts` (new), `src/data-hooks/use-debrief-status.ts` (new) | state + attempts for the tab | 9 |
| `src/components/lesson-material/*`, `src/components/lesson-main/*`, `src/components/video-player/*`, `src/styles.css` | tabs, Debrief panel states, remove buttons | 10 |
| `src/components/ui/circular-progress.tsx`, `src/components/sidebar/*` | D / tick ring, course % | 11 |
| `scripts/backfill-lesson-completions.ts` (new) | backfill `doneAt` | 12 |
| ledger + comments | supersede D1/D19/D21 | 12 |

---

### Task 1: Debrief schedule (pure)

**Files:**
- Create: `src/lib/debrief-schedule.ts`
- Test: `src/lib/__tests__/debrief-schedule.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DEBRIEF_PAR_SCORE = 70;
  export const DEBRIEF_DELAY_MS = 86_400_000;
  /** ISO strings — these cross the wire inside CourseProgress. */
  export type DebriefFacts = { doneAt: string | null; passed: boolean; lastFailedAt: string | null };
  export type DebriefState =
    | { kind: 'not-done' }
    | { kind: 'waiting'; availableAt: string }        // first 24h after done
    | { kind: 'open'; retake: boolean }
    | { kind: 'retake-waiting'; availableAt: string } // after a below-par attempt
    | { kind: 'passed' };
  export function computeDebriefState(facts: DebriefFacts, now: Date): DebriefState;
  export function isPass(totalScore: number): boolean;
  /** Ring badge: 'debrief' for open and retake-waiting, 'passed' for passed, else null. */
  export function debriefBadge(state: DebriefState): 'debrief' | 'passed' | null;
  ```

- [ ] **Step 1: Write failing tests** — `describe('computeDebriefState')`, `now = new Date('2026-10-27T12:00:00Z')`:
  - `passed: true` → `{kind:'passed'}` even when `doneAt` null.
  - `doneAt: null, passed:false` → `{kind:'not-done'}`.
  - `doneAt = now-1h`, no fails → `{kind:'waiting', availableAt: '2026-10-28T11:00:00.000Z'}`.
  - `doneAt = now-24h` exactly → `{kind:'open', retake:false}` (boundary is inclusive: `now >= availableAt` is open).
  - `doneAt = now-48h, lastFailedAt = now-2h` → `{kind:'retake-waiting', availableAt:'2026-10-28T10:00:00.000Z'}`.
  - `doneAt = now-48h, lastFailedAt = now-25h` → `{kind:'open', retake:true}`.
  - `lastFailedAt` earlier than `doneAt` (backfilled history): `doneAt = now-1h, lastFailedAt = now-100h` → `{kind:'retake-waiting', availableAt: doneAt+24h}`.
  - `isPass(70) === true`, `isPass(69) === false`.
  - `debriefBadge` for each kind: waiting→null, not-done→null, open→'debrief', retake-waiting→'debrief', passed→'passed'.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/__tests__/debrief-schedule.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement** per the interface. `availableAt = new Date(Math.max(Date.parse(doneAt), lastFailedAt ? Date.parse(lastFailedAt) : 0) + DEBRIEF_DELAY_MS).toISOString()`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(debrief): pure 24h/par-70 debrief schedule`.

---

### Task 2: Tables + hand-written migration

**Files:**
- Modify: `src/db/schema.ts` (after `lessonTestResultsTable`, ~line 2366)
- Create: `src/db/migrate-debrief-review.ts`, `src/db/__tests__/migrate-debrief-review.test.ts`
- Modify: `package.json` — `"db:migrate-debrief-review": "dotenv -e .env.local -- tsx src/db/migrate-debrief-review.ts"`

**Interfaces:**
- Produces:
  ```ts
  export const lessonCompletionsTable = pgTable('lesson_completions', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 }).notNull().references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    lessonId: integer('lesson_id').notNull().references(() => lessonsTable.id, { onDelete: 'cascade' }),
    doneAt: timestamp('done_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  }, (t) => [uniqueIndex('lesson_completions_user_lesson_idx').on(t.userId, t.lessonId)]);

  export const preparedDebriefsTable = pgTable('prepared_debriefs', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 }).notNull().references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    courseId: integer('course_id').notNull().references(() => coursesTable.id, { onDelete: 'cascade' }),
    lessonSlug: text('lesson_slug').notNull().references(() => lessonsTable.slug, { onDelete: 'cascade' }),
    test: json('test').notNull(),
    /** sha256 of the source text the questions were generated from (call 14). */
    sourceFingerprint: text('source_fingerprint').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  }, (t) => [uniqueIndex('prepared_debriefs_user_course_lesson_idx').on(t.userId, t.courseId, t.lessonSlug)]);
  ```
  `export const DEBRIEF_REVIEW_STATEMENTS: SQL[]` — `create table if not exists` for both, `create unique index if not exists` for both, and `create index if not exists "lesson_test_results_user_lesson_completed_idx" on "lesson_test_results" ("user_id","lesson_slug","completed_at")`.

- [ ] **Step 1: Failing test** — renders each statement with `new PgDialect().sqlToQuery(s).sql` and asserts: 5 statements; every one contains `if not exists`; table names `lesson_completions` and `prepared_debriefs` present; no statement contains `drop` or `truncate` (case-insensitive).
- [ ] **Step 2: Run** `pnpm vitest run src/db/__tests__/migrate-debrief-review.test.ts` — FAIL.
- [ ] **Step 3: Implement** schema tables + migrate file (copy `migrate-viper-context.ts` structure: transaction, `process.argv[1]?.endsWith('migrate-debrief-review.ts')` guard, header comment on why not `db:push`).
- [ ] **Step 4: Run** test — PASS; `pnpm exec tsc --noEmit` — no new errors.
- [ ] **Step 5: Commit** `feat(db): lesson_completions and prepared_debriefs tables`.

---

### Task 3: Progress aggregation — quiz in, debrief out, outstanding items, course percent

**Files:**
- Modify: `src/lib/course-progress-agg.ts`, `src/db/progress-components.ts`, `src/db/course-progress.ts`, `src/db/course.ts` (`getMyCourses`, ~line 457)
- Test: `src/lib/__tests__/course-progress-agg.test.ts` (update), `src/db/__tests__/progress-components.test.ts` (new, for `toComponentFields`)

**Interfaces:**
- Consumes: `DebriefFacts` (Task 1), `lessonCompletionsTable` (Task 2), `TRACKED_LESSON_SECTIONS` / `TrackedLessonSection` from `src/lib/lesson-visit-section.ts` (export the type if missing).
- Produces:
  ```ts
  export type OutstandingItem =
    | { kind: 'video' } | { kind: 'quiz' } | { kind: 'visit' }
    | { kind: 'section'; section: TrackedLessonSection };

  // LessonProgressRow: REMOVE applicableSections, tappedSections, canDebrief, debriefAnswered.
  // ADD:
  applicableSectionNames: TrackedLessonSection[];  // in TRACKED_LESSON_SECTIONS order
  tappedSectionNames: TrackedLessonSection[];
  debriefBearing: boolean;
  debriefPassed: boolean;
  lastFailedDebriefAt: string | null;  // ISO
  doneAt: string | null;               // ISO, from lesson_completions

  export type LessonProgress = {
    lessonId: number; moduleId: number; percent: number; watched: boolean;
    done: boolean;                       // doneAt !== null (sticky)
    outstanding: OutstandingItem[];      // empty iff percent === 100
    debrief: DebriefFacts & { bearing: boolean };
  };
  export function lessonOutstanding(row: LessonProgressRow): OutstandingItem[];
  export function coursePercent(
    lessons: readonly { percent: number; debrief: { bearing: boolean; passed: boolean } }[],
  ): number;
  ```
  `CourseProgress` shape otherwise unchanged; `percent` now comes from `coursePercent(lessons)`; module percents unchanged (mean of lesson percents).

- [ ] **Step 1: Failing tests** in `course-progress-agg.test.ts` (adjust the existing row factory to the new fields):
  - `quiz counts even when hasDebrief` — row `{hasVideo, needsVideoWatch, watchedHits: 18, hasQuiz: true, quizPlayed: false, hasDebrief: true, debriefBearing: true, applicableSectionNames: []}` → lesson `percent === 50`.
  - `debrief never counts toward lesson percent` — same with `quizPlayed: true, debriefPassed: false` → `100`.
  - `outstanding lists exactly what is missing, in order video, quiz, sections, visit` — `watchedHits: 4, hasQuiz, !quizPlayed, applicableSectionNames: ['keyPoints','links','assignments'], tappedSectionNames: ['keyPoints']` → `[{kind:'video'},{kind:'quiz'},{kind:'section',section:'links'},{kind:'section',section:'assignments'}]`.
  - `empty lesson outstanding is visit until visited` → `[{kind:'visit'}]`, then `[]`.
  - `done comes from doneAt, not percent` — `doneAt: '2026-10-01T00:00:00Z'` with percent 50 → `done: true`; `doneAt: null` with percent 100 → `done: false`.
  - `coursePercent flat mean over lessons plus bearing debriefs` — 2 lessons at 100 both bearing, none passed → `50`; one passed → `75`; non-bearing lesson adds no item; `[]` → `0`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/__tests__/course-progress-agg.test.ts` — FAIL.
- [ ] **Step 3: Implement the aggregator.** `componentFractions`: video as today; sections = `tapped ∩ applicable` count / applicable count (intersection replaces the old `Math.min` clamp); quiz when `row.hasQuiz` (regardless of `hasDebrief`); no debrief term. `lessonOutstanding` mirrors `componentFractions` component-for-component (video if `watchedHits < 18` and video applies; quiz if `hasQuiz && !quizPlayed`; each applicable untapped section; visit only when no component applies and `!visited`). `aggregatePercentByCourse` keeps reusing `aggregateCourseProgress`.
- [ ] **Step 4: Implement the SQL** in `progressComponentColumns(userId)`:
  - `applicableSectionNames`: `array_remove(array[case … then 'keyPoints' end, case … 'proTips' …, 'links', 'assignments', <closing tab by discipline, same CASE as today returning 'jobOfTheDay'/'testThis'>], null)` from the same `lesson_material` subquery, `coalesce(…, '{}')`.
  - `tappedSectionNames`: `coalesce(array_agg(distinct section_name) filter (where completed and section_name in (TRACKED…)), '{}')`.
  - `debriefPassed`: `exists (… lesson_test_results … completed_at is not null and total_score >= 70)`.
  - `lastFailedDebriefAt`: `(select max(completed_at) from lesson_test_results … and total_score < 70)`.
  - `doneAt`: `(select c.done_at from lesson_completions c where c.user_id = ${userId} and c.lesson_id = ${lessonsTable.id})`.
  - `debriefBearing` (call 11): `has_debrief and (exists material with coalesce(text,'') <> '' or exists (select 1 from prepared_debriefs p where p.user_id = ${userId} and p.lesson_slug = slug) or exists (select 1 from lesson_test_results t where t.user_id = ${userId} and t.lesson_slug = slug))`. Rationale (Review Focus 4): a transcript-only debrief becomes bearing once the server has actually produced one for this pilot, so a lesson whose captions turn out unusable never blocks course-done.
  - `toComponentFields` maps the arrays (pg returns `string[]`; cast through `TRACKED_LESSON_SECTIONS.includes`), `Date`→ISO for the two timestamps.
- [ ] **Step 5: Test `toComponentFields`** in `src/db/__tests__/progress-components.test.ts`: a row with `doneAt: new Date('2026-10-01T00:00:00Z')` maps to `'2026-10-01T00:00:00.000Z'`; an unknown section name in `tappedSectionNames` is dropped.
- [ ] **Step 6: Run** both test files + `pnpm exec tsc --noEmit`. Fix every compile error the removed fields cause (they are the consumers: grep `debriefAnswered|canDebrief|applicableSections|tappedSections` outside `src/components/lesson-material` and `compute-player-overlay`, which Task 10 owns — there, keep compiling by passing the new fields). Expected: tests PASS, tsc clean.
- [ ] **Step 7: Verify against a real DB** — `pnpm dev` (port 5001), open a course sidebar as a learner, confirm no SQL error in the server log and percents render.
- [ ] **Step 8: Commit** `feat(progress): quiz counts, debrief moves to course percent, outstanding items`.

---

### Task 4: Recording `doneAt`

**Files:**
- Create: `src/db/lesson-completions.ts`, `src/lib/settle-progress.server.ts`
- Test: `src/lib/__tests__/settle-progress.test.ts`

**Interfaces:**
- Consumes: `getCourseProgress` (Task 3), `maybePromote` (`src/lib/promotion.server.ts`).
- Produces:
  ```ts
  // src/db/lesson-completions.ts
  export async function recordLessonCompletions(userId: string, lessonIds: readonly number[]): Promise<void>; // insert … on conflict do nothing
  export async function getDoneLessonIds(userId: string, courseId: number): Promise<Set<number>>;
  // src/lib/settle-progress.server.ts
  /** Record every newly-100% lesson in the course, then run the promotion check. Never throws. */
  export async function settleProgress(o: { userId: string; courseSlug: string }): Promise<Promotion | null>;
  ```

- [ ] **Step 1: Failing tests** (mock `#/db/course-progress`, `#/db/lesson-completions`, `#/lib/promotion.server` with `vi.hoisted`, full stubs):
  - `records only lessons at 100 that are not yet done` — progress lessons `[{lessonId:1,percent:100,done:false},{lessonId:2,percent:100,done:true},{lessonId:3,percent:60,done:false}]` → `recordLessonCompletions` called with `('u1', [1])`.
  - `never records when nothing new` — not called.
  - `records before promoting` — assert call order via `mock.invocationCallOrder`.
  - `never deletes or rewrites a completion` — when a done lesson drops to 60, `recordLessonCompletions` is not called with it and no other write function exists on the module mock.
  - `a recording failure still runs the promotion check and returns its result`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/__tests__/settle-progress.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Both best-effort (`try/catch` + `console.error`), mirroring the routes' existing promotion comments.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(progress): record sticky lesson completion after every progress write`.

---

### Task 5: Wire `settleProgress`; promotion needs done + debriefs

**Files:**
- Modify: `src/routes/api/user/report-video-progress.ts:86-100`, `src/routes/api/user/lesson-section.ts:~110`, `src/routes/api/lesson/quiz/answers.ts:~96`, `src/routes/api/lesson/ai-test/save-results.ts:~110`, `src/routes/api/lesson/material.ts` (after `recordLessonVisit`), `src/lib/tier-completion.ts`, `src/lib/promotion.server.ts`, `src/lib/lesson-gating.server.ts:~185` (archive `completed`)
- Test: existing route tests under `src/routes/api/**/__tests__/`, `src/lib/__tests__/tier-completion.test.ts`, `src/lib/__tests__/promotion.test.ts`

**Interfaces:**
- Consumes: `settleProgress` (Task 4).
- Produces: `TierCompletionInput.progress: readonly { lessonId: number; done: boolean; debrief: { bearing: boolean; passed: boolean } }[]`.

- [ ] **Step 1: Failing tests**
  - Each of the 4 write routes: replace the `maybePromote` mock with a `settleProgress` mock; assert `settleProgress` called with `{ userId: <session id>, courseSlug: gate.courseSlug }` and the response `promotion` equals its resolved value.
  - `material.ts`: `settleProgress` called after `recordLessonVisit` on the unlocked path; NOT called on locked or read-only paths; a rejecting `settleProgress` still returns 200 with material.
  - `tier-completion.test.ts`: `incomplete while a bearing debrief is unpassed` (`done:true, debrief:{bearing:true,passed:false}` → false); `complete when done and passed`; `non-bearing lesson needs only done`; `uses done not percent` (no `percent` field at all on input).
  - Archive read-only: lesson-gating server test — out-of-tier lesson with `done:true, percent:40` → `outOfTier.readOnly === true`.
- [ ] **Step 2: Run** the touched test files — FAIL.
- [ ] **Step 3: Implement.** In routes replace the `maybePromote` block with `const promotion = await settleProgress(...)` (it never throws). In `material.ts` call it after the visit, awaited, result ignored. `isTierComplete` reads `done` and `debrief`; `maybePromote` passes `progress.lessons` straight through. Archive `completed` uses `row.done`.
- [ ] **Step 4: Run** — PASS; `pnpm exec tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(progress): settle completions on every write; promotion needs done lessons and passed debriefs`.

---

### Task 6: Gate on done, carry outstanding items

**Files:**
- Modify: `src/lib/lesson-gating.ts`, `src/lib/lesson-gating-inputs.ts`, `src/lib/lesson-gating.server.ts`, `src/components/sidebar/compute-lesson-locks.ts`, `src/lib/course-resume.ts`, `src/lib/course-resume-level.ts`, `src/lib/course-resume-for-user.ts`, `src/lib/course-card-resume.ts` + its grid query in `src/db/course.ts`, `src/db/course-content.ts`
- Leave alone: `src/lib/library-gating.ts`, `src/lib/library.server.ts` — library file unlocks stay on "video watched" (library ledger D5; not in this spec).
- Test: `src/lib/__tests__/lesson-gating.test.ts`, `lesson-gating-server.test.ts`, `course-resume*.test.ts`, `course-card-resume.test.ts`

**Interfaces:**
- Consumes: `LessonProgress.done`, `.outstanding`, `.watched` (Task 3); `getDoneLessonIds` (Task 4).
- Produces:
  ```ts
  export type GateProgress = {
    /** Video fully watched — drives ONLY the lesson's own material lock. */
    watched: ReadonlySet<string>;
    /** Sticky done — drives lesson and module prerequisites. */
    done: ReadonlySet<string>;
    /** Per lesson slug; may be empty where copy is not needed (card resume). */
    outstanding: ReadonlyMap<string, readonly OutstandingItem[]>;
  };
  export function gateProgress(details: DetailsCourse, progress: { lessons: readonly { lessonId: number; watched: boolean; done: boolean; outstanding?: readonly OutstandingItem[] }[] }): GateProgress;

  export type LessonLock =
    | { kind: 'open' }
    | { kind: 'module-locked'; moduleSlug: string; moduleName: string;
        lessonsLeft: number; next: { lessonName: string; outstanding: readonly OutstandingItem[] } }
    | { kind: 'lesson-locked'; lessonSlug: string; moduleSlug: string; lessonName: string;
        outstanding: readonly OutstandingItem[] };
  export function evaluateLessonLock(course: GateCourse, lessonSlug: string, progress: GateProgress): LessonLock;
  export function evaluateMaterialLock(course: GateCourse, lessonSlug: string, progress: GateProgress): MaterialLock; // uses progress.watched only
  // LockedMaterialResponse 'lesson' blockedBy gains `outstanding`; 'module' blockedBy gains `lessonsLeft`, `next`.
  ```
  `watchedLessonSlugs` stays exported (library still uses it).

- [ ] **Step 1: Failing tests** in `lesson-gating.test.ts`:
  - `next lesson locks until previous is done, even when its video is watched` — watched has A, done empty → B `lesson-locked` with A's outstanding passed through.
  - `opens when previous is done` — done has A.
  - `gate reads done set, not percent` — there is no percent input; A in done with non-empty outstanding → open.
  - `video-less lesson now blocks the chain` — A has `hasVideo:false`, not done → B locked (the old `canBlock` escape is gone: `canBlock(l) === l.isAvailable`).
  - `unavailable lesson never blocks` — unchanged behaviour.
  - `module lock names count and first unfinished lesson` — prerequisite module with lessons X(done), Y(not done, outstanding quiz), Z(not done) → `{kind:'module-locked', lessonsLeft: 2, next:{lessonName:'Y', outstanding:[{kind:'quiz'}]}}`.
  - `material lock still uses watched` — lesson in done but not watched → `video-locked`.
  - `card resume`: `resolveCardResume` with `doneLessonIds` containing A unlocks B; with only full `lessonHits` on A, B stays locked.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/__tests__/lesson-gating.test.ts src/lib/__tests__/course-card-resume.test.ts` — FAIL.
- [ ] **Step 3: Implement.** `isLessonSatisfied` keeps its video meaning (library and material lock use it). Prerequisite checks use `!l.isAvailable || progress.done.has(l.slug)`. Rewrite the `canBlock`/transitivity comment: transitivity now holds because a locked lesson serves no material and records no visit, so it cannot become done. Replace every `watchedLessonSlugs(details, progress)` call for lesson/material locks with `gateProgress(details, progress)` (keep UNFILTERED payload where the current comments say so). `resolveCardResume` gains `doneLessonIds: ReadonlySet<number>`; the grid query in `src/db/course.ts` fetches it via a `lesson_completions` subquery or `getDoneLessonIds`.
- [ ] **Step 4: Run** all gating/resume test files — PASS; tsc clean.
- [ ] **Step 5: Commit** `feat(gating): next lesson unlocks when the previous lesson is done`.

---

### Task 7: Exact lock copy

**Files:**
- Create: `src/lib/lock-copy.ts`, `src/lib/__tests__/lock-copy.test.ts`
- Modify: `src/components/sidebar/lesson-link.tsx:26` (`lockReason`), `src/components/lesson-main/parts/lesson-locked.tsx`, `src/components/lesson-main/parts/lesson-empty.tsx:72-83`, `src/components/lesson-material/parts/material-locked.tsx` (video case copy now "Watch the video to unlock the key points, quiz…" stays; debrief mention removed)

**Interfaces:**
- Consumes: `LessonLock`, `LockedMaterialResponse`, `OutstandingItem`.
- Produces:
  ```ts
  export const SECTION_LABELS: Record<TrackedLessonSection, string>; // 'Key Points','Pro Tips','Links','Assignments','Job of the Day','TEST THIS!' — same labels as compute-material-tabs
  export function describeOutstanding(items: readonly OutstandingItem[]): string;
  export function lessonLockSentence(lock: Exclude<LessonLock, { kind: 'open' }>): string;
  ```

- [ ] **Step 1: Failing tests** — exact strings:
  - `describeOutstanding([{video},{quiz},{section links},{section assignments}])` → `'watch the video, take the quiz, and open Links and Assignments'`.
  - one item `[{quiz}]` → `'take the quiz'`; two `[{video},{quiz}]` → `'watch the video and take the quiz'`; sections only `[links]` → `'open Links'`; three sections → `'open Key Points, Links and Assignments'`; `[{visit}]` → `'open the lesson'`.
  - `lessonLockSentence(lesson-locked 'Lesson 4', [{quiz},{section links}])` → `'Finish Lesson 4 first: take the quiz and open Links.'`
  - `lessonLockSentence(module-locked 'Basics', lessonsLeft 3, next Lesson 4 [{quiz}])` → `'Finish the Basics module first: 3 lessons left. Next: Lesson 4 — take the quiz.'`; `lessonsLeft 1` → `'1 lesson left'`.
  - empty outstanding (sticky-gap edge) → `'Finish Lesson 4 first.'`
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; then use `lessonLockSentence` in all four lock UIs (they render it as visible text, so it stays in the accessible name — keep that).
- [ ] **Step 4: Run** tests + tsc — PASS.
- [ ] **Step 5: Commit** `feat(gating): lock messages name exactly what is left to do`.

---

### Task 8: Debrief server — Postgres preparation, state-gated routes, dev-user fix

**Files:**
- Create: `src/lib/debrief-access.server.ts`, `src/lib/__tests__/debrief-access.test.ts`
- Modify: `src/lib/prepared-debrief.server.ts`, `src/lib/__tests__/prepared-debrief.test.ts`, `src/routes/api/lesson/ai-test/prepare.ts`, `generate.ts`, `save-results.ts`, `src/db/lesson-test.ts`, `src/routes/api/lesson/ai-test/__tests__/{prepare,ai-test-gate}.test.ts`

**Interfaces:**
- Consumes: `computeDebriefState`, `isPass` (Task 1); `preparedDebriefsTable`, `lessonCompletionsTable` (Task 2); `evaluateLessonGate`; `resolveDebriefSource`; `settleProgress` (Task 4).
- Produces:
  ```ts
  // src/db/lesson-test.ts
  export async function getDebriefFacts(userId: string, lessonSlug: string, lessonId: number): Promise<DebriefFacts>;
  export async function getDebriefAttempts(userId: string, lessonSlug: string): Promise<{ id: number; totalScore: number; completedAt: string }[]>; // completed only, newest first
  // src/lib/debrief-access.server.ts
  export type DebriefAccess =
    | { ok: true; courseId: number; lessonId: number; state: DebriefState }
    | { ok: false; status: 403 | 404 };
  /** Gate + level + hasDebrief + facts → state. The single server authority on "may this pilot take/see this debrief now". */
  export async function getDebriefAccess(o: { userId: string; lessonSlug: string; courseSlug: string; now: Date }): Promise<DebriefAccess>;
  // src/lib/prepared-debrief.server.ts (Redis 'ready' key removed; Redis 30-min claim lock kept — it is dedupe, not a clock)
  export function sourceFingerprint(text: string): string; // sha256 hex
  export async function prepareDebrief(k: PreparedDebriefKey): Promise<PrepareOutcome>; // upserts the row; skips if a row with the current fingerprint exists
  export async function takePreparedDebrief(k: PreparedDebriefKey, currentFingerprint: string): Promise<AITest | null>; // delete … returning; null on fingerprint mismatch (row still deleted)
  ```

- [ ] **Step 1: Failing tests**
  - `debrief-access.test.ts`: out-of-tier (either read-only state) → 403 (call 12); `hasDebrief:false` → 404; prerequisite-locked → 403; otherwise returns `computeDebriefState(getDebriefFacts(...), now)` — assert `getDebriefFacts` called with the session user id and the lesson's id.
  - `prepared-debrief.test.ts`: prepare writes a row with `sourceFingerprint === sourceFingerprint(source.text)`; second prepare with same fingerprint does not call `generateTest`; take with a different fingerprint returns null and the row is deleted; take returns the test once.
  - `ai-test-gate.test.ts` (generate): state `waiting` → 409 `{ error: 'not-open', availableAt }`; `retake-waiting` → 409; `passed` → 409; `not-done` → 409; `open` → serves prepared test if fingerprint matches, else generates on demand.
  - save-results: `saveTestResult` called with `userId: session.user.id` (red today: `'dev-user'`); state not `open` → 409 and `saveTestResult` not called (Review Focus 3); score 69 → `prepareDebrief` called with `{userId, courseId, lessonSlug}` after save (retake is pre-generated, call 6/spec "when generation runs"); score 70 → not called; response includes `{ state }` recomputed after the save (`retake-waiting` with `availableAt` = completedAt+24h, or `passed`); `settleProgress` called (Task 5).
  - prepare route: no longer requires `materialLock.kind === 'video-locked'`; refuses (204, no prepare) when state is `passed`, or out-of-tier; prepares when `not-done`, `waiting`, `open`, `retake-waiting`.
- [ ] **Step 2: Run** the four test files — FAIL.
- [ ] **Step 3: Implement.** `generate`/`save-results` call `getDebriefAccess` first and require `state.kind === 'open'`. `generate` computes the current fingerprint from `resolveDebriefSource` text before taking. In save-results, kick off the retake prep with `waitUntil` from `@vercel/functions` if installed (check `package.json`), else `void prepareDebrief(...).catch(console.error)` — it must not delay the response. Delete the `'dev-user'` placeholder and its TODO/NOTE comment.
- [ ] **Step 4: Run** — PASS; tsc clean.
- [ ] **Step 5: Commit** `feat(debrief): server-enforced 24h schedule, Postgres-prepared retakes, real user on save`.

---

### Task 9: Debrief status endpoint + hook

**Files:**
- Create: `src/routes/api/lesson/debrief-status.ts`, `src/routes/api/lesson/__tests__/debrief-status.test.ts`, `src/data-hooks/use-debrief-status.ts`
- Modify: `src/data-hooks/keys.ts`; `use-lesson-ai-test.ts` `useSaveResults` `onSuccess` → `setQueryData(debriefStatus key, response.state)` and invalidate the course-progress query.

**Interfaces:**
- Consumes: `getDebriefAccess`, `getDebriefAttempts` (Task 8).
- Produces:
  ```ts
  // GET /api/lesson/debrief-status?lessonSlug&courseSlug
  export type DebriefStatusResponse = {
    state: DebriefState;
    lessonOutstanding: OutstandingItem[]; // for the not-done copy
    /** Present ONLY when state.kind === 'passed' — history is hidden until then. */
    attempts?: { id: number; totalScore: number; completedAt: string; passed: boolean }[];
  };
  export const useDebriefStatus: (a: { courseSlug: string; lessonSlug: string; enabled: boolean }) => UseQueryResult<DebriefStatusResponse>; // staleTime 60_000
  ```
- [ ] **Step 1: Failing tests** — `attempts` absent for `open`, `retake-waiting`, `waiting`; present and passing-first for `passed` (sort: passing attempt first, then newest first); 403/404 passthrough from `getDebriefAccess`; `getDebriefAttempts` not called unless passed.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (route pattern: `results.ts`). **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(debrief): status endpoint for the Debrief tab`.

---

### Task 10: Learner UI — tabs, Debrief panel states, remove the debrief buttons

**Files:**
- Modify: `src/components/lesson-material/compute-material-tabs.ts` (+ test), `lesson-material.tsx`, `lesson-material-wrapper.tsx` (`'empty'` case), `parts/debrief-quiz-container.tsx`, `parts/score-report.tsx`
- Create: `src/components/lesson-material/compute-debrief-panel.ts` (+ `__tests__`), `src/lib/format-debrief-time.ts` (+ `src/lib/__tests__/format-debrief-time.test.ts`), `parts/debrief-panel-container.tsx`, `parts/debrief-wait.tsx`, `parts/debrief-attempt-history.tsx`, `src/atoms/debrief.ts`
- Delete: `src/components/video-player/parts/debrief-overlay.tsx`; the `'debrief'` kind and `hasDebrief`/`canDebrief`/`hasCurrentTest` debrief branch in `compute-player-overlay.ts` (+ test); `onDebrief` in `lesson-player-container.tsx`; `vp-debrief-*` in `src/styles.css:868-904`; `usePrepareDebriefOnPlay` gating on `materialLocked`; the `onDebrief` button in `lesson-no-video.tsx` / `lesson-no-video-container.tsx` (same shortcut, same reason).

**Interfaces:**
- Consumes: `useDebriefStatus` (Task 9), `DebriefState`, `describeOutstanding` (Task 7).
- Produces:
  ```ts
  // compute-material-tabs.ts
  export type MaterialTabValue = 'keyPoints' | 'quiz' | 'debrief' | 'proTips' | 'links' | 'assignments' | 'jobOfTheDay' | 'testThis';
  export type ComputeMaterialTabsArgs = { hasQuiz: boolean; hasDebriefTab: boolean; extraTab: MaterialExtraTab };
  // order: keyPoints, quiz?, debrief?, proTips, links, assignments, extra
  // compute-debrief-panel.ts
  export type DebriefPanel =
    | { kind: 'loading' } | { kind: 'error' }
    | { kind: 'not-done'; outstanding: readonly OutstandingItem[] }
    | { kind: 'waiting'; availableAt: string }
    | { kind: 'take'; retake: boolean }                       // renders DebriefQuizContainer
    | { kind: 'just-failed'; availableAt: string }            // score report + reopen time (call 2)
    | { kind: 'retake-waiting'; availableAt: string }         // ONLY the reopen time
    | { kind: 'passed'; attempts: NonNullable<DebriefStatusResponse['attempts']> };
  export function computeDebriefPanel(a: { status: UseQueryResult-like {isPending,isError,data}; justSubmittedLessonSlug: string | null; lessonSlug: string; sessionInProgress: boolean }): DebriefPanel;
  // format-debrief-time.ts
  export function formatDebriefTime(iso: string, now: Date): string;   // 'Tue 28 Oct, 3:40 PM' / '… 2027' when year differs
  export function msUntil(iso: string, now: Date): number;             // clamped to [0, 2_147_483_647]
  // atoms/debrief.ts
  export const justSubmittedDebriefAtom: PrimitiveAtom<string | null>; // lesson slug of the attempt submitted in this page session
  ```

- [ ] **Step 1: Failing tests**
  - `compute-material-tabs.test.ts`: quiz AND debrief both present when `hasQuiz && hasDebriefTab`; order exact; no quiz tab when `!hasQuiz`.
  - `compute-debrief-panel.test.ts`: each `DebriefState` maps to its panel; `retake-waiting` + `justSubmittedLessonSlug === lessonSlug` → `just-failed`; same state for a different slug → `retake-waiting` (only reopen time); `open` while a session is in progress stays `take` even after the status refetches.
  - `format-debrief-time.test.ts` with `TZ` fixed via `process.env.TZ = 'Pacific/Auckland'` set in the test file's top before importing (or pass a `timeZone` through `Intl` — choose one and test it): `2026-10-27T23:30:00Z` → `'Wed 28 Oct, 12:30 PM'`; year boundary `2027-01-01T…` with `now` in 2026 → ends `' 2027'`; `msUntil` past → 0, far future → 2_147_483_647.
  - `compute-player-overlay.test.ts`: kind union is now `'coverage' | 'none'`; resting at end on a debrief lesson → `'none'`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - `LessonMaterialView`: `hasQuiz = (material.quiz?.length ?? 0) > 0`; `hasDebriefTab = hasDebrief && !readOnly && Boolean(material.text)`; Debrief panel renders `DebriefPanelContainer`. In `lesson-material-wrapper.tsx` `'empty'` case keep `canDebriefFromTranscript` as the condition and render `DebriefPanelContainer`.
  - `DebriefPanelContainer`: `useDebriefStatus` → `computeDebriefPanel` → presentational parts. Schedules a refetch at `availableAt` with `setTimeout(refetch, msUntil(availableAt, new Date()))` in an effect (cleared on unmount). Times render inside `ClientGate`.
  - `DebriefWait` (presentational): heading + `Opens {time}` / `Next attempt opens {time}`; for `not-done` the sentence `Opens 24 hours after you finish this lesson — {describeOutstanding}.`
  - `DebriefAttemptHistory`: list of attempts (date, `{score}/100`, "Passed" / "Below par"), passing first, each a Base UI `Collapsible` containing `ScoreReport` (needs that attempt's questions/answers: extend `getDebriefAttempts`/attempts payload with `questions` and `answers` only when passed).
  - `ScoreReport`: remove `onRetake` and the Retake button + `REASON_ID` readonly-retake copy (call 8). Add optional `footer` slot for the just-failed reopen line.
  - `DebriefQuizContainer`: on save success set `justSubmittedDebriefAtom` to the lesson slug; remove retake handler.
- [ ] **Step 4: Run** all touched tests + `pnpm exec tsc --noEmit` + `pnpm check` — PASS / clean.
- [ ] **Step 5: Browser check** (`pnpm dev`, port 5001, learner account): the post-video button is gone; Quiz and Debrief tabs both show; Debrief tab shows the right state for a lesson not done / just done.
- [ ] **Step 6: Commit** `feat(debrief): quiz tab returns, Debrief tab shows its schedule, post-video button removed`.

---

### Task 11: Lesson ring D / tick, sidebar course percent

**Files:**
- Modify: `src/components/ui/circular-progress.tsx`, `src/components/sidebar/lesson-link.tsx`, `lesson-list.tsx`, `course-sidebar-wrapper.tsx:95-130`
- Create: `src/components/sidebar/compute-lesson-ring.ts` (+ `__tests__/compute-lesson-ring.test.ts`)

**Interfaces:**
- Consumes: `computeDebriefState`, `debriefBadge` (Task 1), `coursePercent` (Task 3), `formatDebriefTime` (Task 10).
- Produces:
  ```ts
  // circular-progress.tsx — new optional prop
  badge?: 'debrief' | 'passed';   // 'debrief': red disc with "D"; 'passed': full ring + check (lucide `Check`)
  // compute-lesson-ring.ts
  export type LessonRing = { percent: number; badge: 'debrief' | 'passed' | null; ariaLabel: string; refreshAt: string | null };
  export function computeLessonRing(a: { lessonName: string; percent: number; debrief: DebriefFacts & { bearing: boolean }; now: Date }): LessonRing;
  ```
- [ ] **Step 1: Failing tests** — `computeLessonRing`: not bearing → `badge null`, label `'Lesson X, 40% complete'`; open → `'debrief'`, label `'Lesson X, 100% complete, debrief ready'`; retake-waiting → `'debrief'`, label `'…, debrief reopens Tue 28 Oct, 3:40 PM'`, `refreshAt` = availableAt; first waiting → `null`, `refreshAt` = availableAt; passed → `'passed'`, label `'…, debrief passed'`. Sidebar course percent: `coursePercent` fed from visible lessons only (extract the `useMemo` body into a pure `computeSidebarPercents(details, progress)` in the same folder and test it: 2 visible lessons at 100, both bearing, one passed → course 75; module percents exclude debriefs).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Badge `'debrief'`: inside the ring, a filled `bg-error` disc with a bold `D` in `text-black` (AA on red-9 per memory note); at `size={20}` the glyph is too small to read, so `LessonLink` passes `size={24}` whenever a badge is present and the D uses `text-[11px] font-bold leading-none` — verify ≥ 4.5:1 by computing contrast of black on the generated `--color-error-solid` in both themes and record the ratio in a code comment. `'passed'`: ring full (`value` forced to 100) and a `Check` icon `size={12}` in `text-accent` (accent-9 on the page background must be ≥ 3:1 for a non-text graphic — check and note). `role="progressbar"` stays; `aria-label` from `computeLessonRing`. Ring `refreshAt` → the sidebar container re-renders at the soonest `refreshAt` (one `setTimeout`, `msUntil`).
- [ ] **Step 4: Run** tests, tsc, `pnpm check` — PASS.
- [ ] **Step 5: Browser check** light + dark: D legible, tick visible, screen-reader name correct (inspect the accessibility tree via devtools).
- [ ] **Step 6: Commit** `feat(sidebar): red D and tick on lesson rings; course percent includes debriefs`.

---

### Task 12: Backfill, docs, rollout

**Files:**
- Create: `scripts/backfill-lesson-completions.ts` (+ `scripts/backfill-lesson-completions.test.ts` for the pure part), `package.json` script `"db:backfill-lesson-completions": "dotenv -e .env.local -- tsx scripts/backfill-lesson-completions.ts"`
- Modify: `docs/superpowers/specs/2026-08-01-lesson-completion-ledger.md` (mark D1, D19, D21 superseded, link the spec); stale comments citing them in `course-progress-agg.ts`, `compute-material-tabs.ts`, `lesson-gating.ts`, `progress-components.ts`, `tier-completion.ts`.

**Interfaces:**
- Produces: `export function completionTimestamp(parts: { videoWatchedAt: Date | null; sectionTappedAt: readonly Date[]; quizFirstAt: Date | null; visitedAt: Date | null }): Date | null` — latest of the non-null parts that the lesson needs; null if none.
- [ ] **Step 1: Failing test** — latest wins; nulls ignored; all-null → null.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** Script: for every (user, subscribed course) → `getCourseProgress`; for each lesson with `percent === 100 && !done`, query the component timestamps (18th distinct milestone's first `videos_progress.created_at` = `max over milestones of min(created_at) per milestone`; `lesson_material_progress.created_at` for each applicable section; `min(lesson_quiz_answers.created_at)`; the `'page'` row's `created_at`) and insert with that `done_at`. `--dry-run` flag prints counts per course without writing. Idempotent (`on conflict do nothing`).
- [ ] **Step 4: Run** test — PASS. Dry-run against dev DB: `pnpm db:backfill-lesson-completions --dry-run` — prints counts, no errors.
- [ ] **Step 5: Full suite** `pnpm test` and `pnpm exec tsc --noEmit` and `pnpm check` — all green (report any pre-existing failures verbatim, do not hide them).
- [ ] **Step 6: Commit** `chore(progress): backfill lesson completions; supersede ledger D1/D19/D21`.

**Rollout (for the PR description — the order matters):** `db:migrate-debrief-review` on prod → `db:backfill-lesson-completions` on prod (from this branch) → deploy. Deploying before the backfill locks every pilot out of everything past each module's first lesson until the backfill runs.
