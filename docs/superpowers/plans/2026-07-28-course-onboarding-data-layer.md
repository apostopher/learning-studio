# Course Onboarding Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `course_onboarding` table plus the zod types and pure helper functions that record a user's answers to a course's onboarding questions and derive what is still pending.

**Architecture:** One row per `(userId, courseId)`, created when the user opens onboarding and patched incrementally. Answers are a `questionId → answer` jsonb map. A `questionSetHash` column records which question set the row was last reconciled against. What to prompt is derived from the data (question ids with no answer key), not from the hash.

**Tech Stack:** Drizzle ORM + PostgreSQL, drizzle-zod, zod v4, vitest, biome.

**Spec:** `docs/superpowers/specs/2026-07-28-course-onboarding-design.md`

## Global Constraints

- **Import alias in test-reachable code: use `#/`, never `@/`.** Both are in `tsconfig.json` paths, but only `#/` is a real Node subpath import (`package.json` `imports`). Vitest cannot resolve `@/` — verified: importing `#/db/schema` in a test fails with `Cannot find package '@/types'` because `schema.ts` imports `@/types`. New files must use `#/`.
- **`src/db/schema.ts` uses double quotes and currently fails `biome check`** (pre-existing, ~730 lines of quote-style diff). Match the file's existing double-quote style when editing it, and **never run biome with `--write` on `src/db/schema.ts`** — it would reformat the whole file into an unrelated diff.
- **All other new/modified files use single quotes** (biome `quoteStyle: 'single'`).
- **Never `git add -A`.** Always stage explicit paths. Verify with `git status --short` before every commit.
- **Do not run `pnpm db:push` yourself.** Applying schema changes to the database is the user's step. Task 4 ends by asking the user to run it.
- Test files live in `src/__tests__/` (for `src/types.ts`) and `src/lib/__tests__/` (for `src/lib/`), named `<module>.test.ts`.
- Run tests with `pnpm vitest run <path>`. Note: vitest prints `close timed out after 10000ms / something prevents Vite server from exiting` after the summary. That is a pre-existing quirk of this repo's config, **not** a test failure. Judge pass/fail from the `Test Files` / `Tests` summary lines.
- Branch: `feat/course-onboarding` (already created, spec already committed).
- **Verified baseline before this plan starts** (measured 2026-07-28): `pnpm exec tsc --noEmit` is **completely clean**, and `pnpm test` is **95 files / 482 passed / 28 skipped**. So "no new errors" means literally zero tsc output, and any test regression is yours.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/types.ts` | Modify | Add `OnboardingAnswersSchema` beside the existing `OnboardingQuestionsSchema` (line ~67). |
| `src/__tests__/onboarding-answers-schema.test.ts` | Create | Validation tests for `OnboardingAnswersSchema`. |
| `src/lib/course-onboarding.ts` | Create | Pure, dependency-free onboarding logic: `hashQuestionSet`, `pendingQuestions`, `isOnboardingComplete`. No DB, no React, no I/O — so it is trivially testable and usable on both server and client. |
| `src/lib/__tests__/course-onboarding.test.ts` | Create | Tests for all three helpers. |
| `src/db/schema.ts` | Modify | Add `courseOnboardingTable`, its relations, and its drizzle-zod schemas after `courseSubscriptionsTableRelations` (ends line 748). |

**Why a separate `src/lib/course-onboarding.ts`** rather than extending `src/components/admin/onboarding-helpers.ts`: that file lives under `components/admin` and is admin-authoring UI support. These helpers run in the user-facing flow and on the server. `src/lib/` is where this repo keeps pure logic with tests in `src/lib/__tests__/` (see `course-progress-agg.ts`, `is-associate.ts`, `slugify.ts`).

---

## Task 1: `OnboardingAnswersSchema`

**Files:**
- Modify: `src/types.ts:70` (insert immediately after the `OnboardingQuestions` type export)
- Test: `src/__tests__/onboarding-answers-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `OnboardingAnswersSchema: z.ZodRecord<z.ZodString, z.ZodString>`
  - `type OnboardingAnswers = Record<string, string>`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/onboarding-answers-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OnboardingAnswersSchema } from '#/types';

describe('OnboardingAnswersSchema', () => {
  it('accepts an empty map', () => {
    expect(OnboardingAnswersSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a questionId to answer map', () => {
    const r = OnboardingAnswersSchema.safeParse({
      q1: 'Two years, mostly FPV.',
      q2: 'BVLOS confidence.',
    });
    expect(r.success).toBe(true);
  });

  it('accepts an empty-string answer', () => {
    // A question the user visited and deliberately left blank still counts as
    // answered — see pendingQuestions in src/lib/course-onboarding.ts.
    expect(OnboardingAnswersSchema.safeParse({ q1: '' }).success).toBe(true);
  });

  it('rejects a non-string answer', () => {
    expect(OnboardingAnswersSchema.safeParse({ q1: 42 }).success).toBe(false);
  });

  it('rejects a null answer', () => {
    expect(OnboardingAnswersSchema.safeParse({ q1: null }).success).toBe(false);
  });

  it('rejects an answer longer than 5000 chars', () => {
    const r = OnboardingAnswersSchema.safeParse({ q1: 'x'.repeat(5001) });
    expect(r.success).toBe(false);
  });

  it('accepts an answer of exactly 5000 chars', () => {
    const r = OnboardingAnswersSchema.safeParse({ q1: 'x'.repeat(5000) });
    expect(r.success).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(OnboardingAnswersSchema.safeParse([]).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/__tests__/onboarding-answers-schema.test.ts`

Expected: FAIL. The error will be about `OnboardingAnswersSchema` not being exported from `#/types` (an import/undefined error), not an assertion failure.

- [ ] **Step 3: Write the minimal implementation**

In `src/types.ts`, immediately after line 70 (`export type OnboardingQuestions = ...`), add:

```ts
/** A user's onboarding answers, keyed by question id. */
export const OnboardingAnswersSchema = z.record(
  z.string(),
  z.string().max(5000),
);
export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;
```

Note: this repo is on zod v4, where `z.record` requires both a key and a value schema (v3's single-argument form is gone). The surrounding file already uses v4 idioms such as `z.url()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/__tests__/onboarding-answers-schema.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Check formatting and types**

Run: `pnpm exec biome check src/types.ts src/__tests__/onboarding-answers-schema.test.ts`

Expected: no errors. If biome reports formatting diffs, run `pnpm exec biome check --write` on **those two paths only**.

Run: `pnpm exec tsc --noEmit`

Expected: zero output. The baseline is clean, so any error is one you introduced.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/__tests__/onboarding-answers-schema.test.ts
git status --short
git commit -m "feat(onboarding): add OnboardingAnswersSchema"
```

Confirm `git status --short` shows only those two files staged before committing.

---

## Task 2: `hashQuestionSet`

**Files:**
- Create: `src/lib/course-onboarding.ts`
- Test: `src/lib/__tests__/course-onboarding.test.ts`

**Interfaces:**
- Consumes: `OnboardingQuestions` from `#/types` (`{ id: string; text: string }[]`).
- Produces: `hashQuestionSet(questions: OnboardingQuestions): string` — a 16-character lowercase hex string.

**Why this design:** The hash must be stable across processes and deploys, and callable synchronously on both server and client. `crypto.subtle.digest` is async; Node's `createHash` is server-only. FNV-1a over a canonical string is sync, dependency-free, and identical everywhere. It is non-cryptographic, which is fine: it only detects whether an admin changed the question set, so there is no adversary to resist.

The canonical string is **length-prefixed** rather than delimiter-joined. A naive `` `${id}:${text}` `` join lets question text forge a delimiter — `[{id:'a', text:'b:c'}]` and `[{id:'a:b', text:'c'}]` both produce `a:b:c` and would collide. Length prefixes make that impossible.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/course-onboarding.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashQuestionSet } from '#/lib/course-onboarding';
import type { OnboardingQuestions } from '#/types';

const QUESTIONS: OnboardingQuestions = [
  { id: 'q1', text: 'What is your flying experience?' },
  { id: 'q2', text: 'What do you want from this course?' },
];

describe('hashQuestionSet', () => {
  it('is deterministic for the same input', () => {
    expect(hashQuestionSet(QUESTIONS)).toBe(hashQuestionSet(QUESTIONS));
  });

  it('returns 16 lowercase hex chars, well inside varchar(64)', () => {
    expect(hashQuestionSet(QUESTIONS)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles an empty question set', () => {
    expect(hashQuestionSet([])).toMatch(/^[0-9a-f]{16}$/);
    expect(hashQuestionSet([])).toBe(hashQuestionSet([]));
  });

  it('changes when questions are reordered', () => {
    const reordered = [QUESTIONS[1], QUESTIONS[0]];
    expect(hashQuestionSet(reordered)).not.toBe(hashQuestionSet(QUESTIONS));
  });

  it('changes when a question text is edited', () => {
    const edited = [QUESTIONS[0], { id: 'q2', text: 'Why this course?' }];
    expect(hashQuestionSet(edited)).not.toBe(hashQuestionSet(QUESTIONS));
  });

  it('changes when a question id is changed', () => {
    const edited = [QUESTIONS[0], { ...QUESTIONS[1], id: 'q3' }];
    expect(hashQuestionSet(edited)).not.toBe(hashQuestionSet(QUESTIONS));
  });

  it('changes when a question is added', () => {
    const added = [...QUESTIONS, { id: 'q3', text: 'Anything else?' }];
    expect(hashQuestionSet(added)).not.toBe(hashQuestionSet(QUESTIONS));
  });

  it('changes when a question is removed', () => {
    expect(hashQuestionSet([QUESTIONS[0]])).not.toBe(
      hashQuestionSet(QUESTIONS),
    );
  });

  it('does not collide when text contains the field delimiter', () => {
    // A naive `${id}:${text}` encoding renders both of these as "a:b:c".
    const a: OnboardingQuestions = [{ id: 'a', text: 'b:c' }];
    const b: OnboardingQuestions = [{ id: 'a:b', text: 'c' }];
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });

  it('does not collide when text contains digits that mimic a length prefix', () => {
    const a: OnboardingQuestions = [{ id: 'a', text: '1:b' }];
    const b: OnboardingQuestions = [{ id: 'a1', text: ':b' }];
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });

  it('handles multi-byte characters', () => {
    const a: OnboardingQuestions = [{ id: 'q1', text: 'café ✈︎' }];
    const b: OnboardingQuestions = [{ id: 'q1', text: 'cafe ✈︎' }];
    expect(hashQuestionSet(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/course-onboarding.test.ts`

Expected: FAIL — the module `#/lib/course-onboarding` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/course-onboarding.ts`:

```ts
import type { OnboardingQuestions } from '#/types';

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/**
 * Length-prefixed encoding of the question set. Prefixing each field with its
 * length means no question text can forge a delimiter: a plain `id:text` join
 * would render `{id:'a', text:'b:c'}` and `{id:'a:b', text:'c'}` identically.
 */
const canonicalize = (questions: OnboardingQuestions): string =>
  questions
    .map((q) => `${q.id.length}:${q.id}${q.text.length}:${q.text}`)
    .join('');

/**
 * Stable hash of a course's onboarding question set — order-sensitive, over
 * both id and text.
 *
 * FNV-1a (64-bit), not a cryptographic hash: this only detects whether an
 * admin changed the question set, so there is no adversary to resist. It is
 * synchronous and dependency-free, so it produces identical output on the
 * server and in the browser.
 */
export const hashQuestionSet = (questions: OnboardingQuestions): string => {
  const bytes = new TextEncoder().encode(canonicalize(questions));
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
};
```

Note the `.padStart(16, '0')`: without it, a hash whose leading bytes are zero would render shorter than 16 chars and break the fixed-width expectation.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/course-onboarding.test.ts`

Expected: PASS, 11 tests.

- [ ] **Step 5: Check formatting and types**

Run: `pnpm exec biome check src/lib/course-onboarding.ts src/lib/__tests__/course-onboarding.test.ts`

Expected: no errors. Fix with `--write` on those paths only if needed.

Run: `pnpm exec tsc --noEmit`

Expected: no new errors. If `BigInt` literals (`123n`) error, `tsconfig.json` targets ES2022 and supports them — re-check that you did not introduce a syntax typo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/course-onboarding.ts src/lib/__tests__/course-onboarding.test.ts
git status --short
git commit -m "feat(onboarding): add hashQuestionSet"
```

---

## Task 3: `pendingQuestions` and `isOnboardingComplete`

**Files:**
- Modify: `src/lib/course-onboarding.ts` (append)
- Test: `src/lib/__tests__/course-onboarding.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `OnboardingQuestions` and `OnboardingAnswers` from `#/types` (Task 1).
- Produces:
  - `pendingQuestions(questions: OnboardingQuestions, answers: OnboardingAnswers): OnboardingQuestions`
  - `isOnboardingComplete(questions: OnboardingQuestions, answers: OnboardingAnswers, onboardingCompletedAt: Date | null): boolean`

**Two decisions these functions lock in:**

1. **A key present in `answers` counts as answered, even if the value is an empty string.** Otherwise a question the user deliberately skipped would be re-prompted forever. The consequence for later steps: the client must only write a key for a question the user actually visited — it must not pre-seed `answers` with empty strings for every question on open, or everything would immediately read as answered.

2. **Use `Object.hasOwn`, not the `in` operator.** `'toString' in {}` is `true`, so a question with id `toString` or `constructor` would be silently treated as answered. `Object.hasOwn` only sees own properties.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/course-onboarding.test.ts`. Also extend the existing import line at the top of the file to:

```ts
import {
  hashQuestionSet,
  isOnboardingComplete,
  pendingQuestions,
} from '#/lib/course-onboarding';
import type { OnboardingAnswers, OnboardingQuestions } from '#/types';
```

Then append these blocks:

```ts
describe('pendingQuestions', () => {
  it('returns every question when there are no answers', () => {
    expect(pendingQuestions(QUESTIONS, {})).toEqual(QUESTIONS);
  });

  it('returns nothing when every question is answered', () => {
    const answers: OnboardingAnswers = { q1: 'a', q2: 'b' };
    expect(pendingQuestions(QUESTIONS, answers)).toEqual([]);
  });

  it('returns only the unanswered questions', () => {
    expect(pendingQuestions(QUESTIONS, { q1: 'a' })).toEqual([QUESTIONS[1]]);
  });

  it('preserves the course question order', () => {
    const three: OnboardingQuestions = [
      ...QUESTIONS,
      { id: 'q3', text: 'Anything else?' },
    ];
    expect(pendingQuestions(three, { q2: 'b' })).toEqual([three[0], three[2]]);
  });

  it('treats an empty-string answer as answered', () => {
    // The user visited the question and left it blank. Re-prompting forever
    // would be wrong.
    expect(pendingQuestions(QUESTIONS, { q1: '', q2: '' })).toEqual([]);
  });

  it('ignores orphan answers for questions that no longer exist', () => {
    const answers: OnboardingAnswers = { q1: 'a', q2: 'b', qGone: 'old' };
    expect(pendingQuestions(QUESTIONS, answers)).toEqual([]);
  });

  it('reports a newly added question as pending', () => {
    const added: OnboardingQuestions = [
      ...QUESTIONS,
      { id: 'q3', text: 'Anything else?' },
    ];
    expect(pendingQuestions(added, { q1: 'a', q2: 'b' })).toEqual([added[2]]);
  });

  it('does not treat inherited Object properties as answers', () => {
    const tricky: OnboardingQuestions = [
      { id: 'toString', text: 'Trick question' },
      { id: 'constructor', text: 'Another one' },
    ];
    expect(pendingQuestions(tricky, {})).toEqual(tricky);
  });

  it('returns nothing when the course has no questions', () => {
    expect(pendingQuestions([], {})).toEqual([]);
  });
});

describe('isOnboardingComplete', () => {
  const answered: OnboardingAnswers = { q1: 'a', q2: 'b' };

  it('is false when the user never finished the flow', () => {
    expect(isOnboardingComplete(QUESTIONS, answered, null)).toBe(false);
  });

  it('is true when the flow is finished and nothing is pending', () => {
    expect(isOnboardingComplete(QUESTIONS, answered, new Date(0))).toBe(true);
  });

  it('is false when finished earlier but a new question was since added', () => {
    const added: OnboardingQuestions = [
      ...QUESTIONS,
      { id: 'q3', text: 'Anything else?' },
    ];
    expect(isOnboardingComplete(added, answered, new Date(0))).toBe(false);
  });

  it('is false when the flow is unfinished even with nothing pending', () => {
    expect(isOnboardingComplete(QUESTIONS, answered, null)).toBe(false);
  });

  it('is true for a course with no questions once the flow is finished', () => {
    expect(isOnboardingComplete([], {}, new Date(0))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/course-onboarding.test.ts`

Expected: FAIL — `pendingQuestions` and `isOnboardingComplete` are not exported. The `hashQuestionSet` tests from Task 2 will fail to run too, because the import at the top of the file fails.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/course-onboarding.ts`, and extend its import line to:

```ts
import type { OnboardingAnswers, OnboardingQuestions } from '#/types';
```

```ts
/**
 * The course's questions that have no answer yet — the source of truth for
 * what to prompt. Derived from the data, never from questionSetHash.
 *
 * A key present in `answers` counts as answered even when the value is an
 * empty string: the user visited that question and left it blank, and
 * re-prompting them forever would be wrong. Callers must therefore only write
 * a key for a question the user actually visited.
 *
 * Uses Object.hasOwn rather than `in` so a question with id `toString` or
 * `constructor` is not silently treated as answered.
 */
export const pendingQuestions = (
  questions: OnboardingQuestions,
  answers: OnboardingAnswers,
): OnboardingQuestions =>
  questions.filter((q) => !Object.hasOwn(answers, q.id));

/**
 * A user is done only when they finished the flow AND nothing is pending.
 * Both conditions, not either: someone who completed onboarding before three
 * new questions were added is complete-but-pending, which is a distinct state
 * from never-started and from fully-done.
 */
export const isOnboardingComplete = (
  questions: OnboardingQuestions,
  answers: OnboardingAnswers,
  onboardingCompletedAt: Date | null,
): boolean =>
  onboardingCompletedAt !== null &&
  pendingQuestions(questions, answers).length === 0;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/course-onboarding.test.ts`

Expected: PASS, 25 tests (11 from Task 2, 9 + 5 from this task).

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`

Expected: 97 test files pass — baseline 95, plus `onboarding-answers-schema.test.ts` from Task 1 and `course-onboarding.test.ts` from Task 2. Nothing in this task touches existing modules, so any failure in another file is a regression — investigate before committing.

- [ ] **Step 6: Check formatting and types**

Run: `pnpm exec biome check src/lib/course-onboarding.ts src/lib/__tests__/course-onboarding.test.ts`

Run: `pnpm exec tsc --noEmit`

Expected: no errors from either.

- [ ] **Step 7: Commit**

```bash
git add src/lib/course-onboarding.ts src/lib/__tests__/course-onboarding.test.ts
git status --short
git commit -m "feat(onboarding): derive pending questions and completion state"
```

---

## Task 4: `courseOnboardingTable`

**Files:**
- Modify: `src/db/schema.ts` — add the import on line 33, the table + schemas + relations after line 748, and two `many()` entries in existing relation blocks.

**Interfaces:**
- Consumes: `OnboardingAnswersSchema` from `@/types` (Task 1).
- Produces:
  - `courseOnboardingTable`
  - `courseOnboardingInsertSchema` / `type CourseOnboardingInsert`
  - `courseOnboardingSelectSchema` / `type CourseOnboardingSelect`
  - `courseOnboardingTableRelations`

**No unit test for this task, and why:** a drizzle table declaration is configuration, not behavior — a test asserting the column list would only restate the declaration. It also cannot be imported under vitest: `src/db/schema.ts` imports `@/types`, which vitest cannot resolve (see Global Constraints). Its real verification is applying it to Postgres and checking the constraints hold, which is Step 5 below and is the user's step to run.

- [ ] **Step 1: Add the type import**

In `src/db/schema.ts`, extend the existing import block at lines 22–34 by adding `OnboardingAnswersSchema` to the named imports from `@/types` (keep `@/types` here — it matches the rest of the file, and this module is not imported by tests):

```ts
  OnboardingQuestionsSchema,
  OnboardingAnswersSchema,
} from "@/types";
```

- [ ] **Step 2: Add the table, schemas, and relations**

In `src/db/schema.ts`, insert after `courseSubscriptionsTableRelations` (which ends at line 748) and before `export const docs = pgTable(`. Use **double quotes** to match the file:

```ts
export const courseOnboardingTable = pgTable(
  "course_onboarding",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    // questionId -> answer text. Defaults to {} rather than null so "not
    // answered yet" is an empty map, not a null check in every consumer.
    answers: jsonb("answers")
      .$type<z.infer<typeof OnboardingAnswersSchema>>()
      .notNull()
      .default({}),
    // The question set this row was last reconciled against. Null until the
    // first answer is written. Flags stale responses in admin views; it does
    // NOT decide re-prompting — pendingQuestions() does.
    questionSetHash: varchar("question_set_hash", { length: 64 }),
    // Null means in-progress and resumable.
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      mode: "date",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    // One record per user per course. This is what makes the incremental-save
    // upsert safe against double-submit, concurrent tabs, and retried requests.
    uniqueIndex("course_onboarding_user_course_idx").on(
      table.userId,
      table.courseId,
    ),
    // The unique index is user-first, so it will not serve the admin
    // "all responses for this course" query.
    index("course_onboarding_course_id_idx").on(table.courseId),
  ],
);

export const courseOnboardingInsertSchema = createInsertSchema(
  courseOnboardingTable,
  {
    answers: OnboardingAnswersSchema,
  },
);
export type CourseOnboardingInsert = z.infer<
  typeof courseOnboardingInsertSchema
>;

export const courseOnboardingSelectSchema = createSelectSchema(
  courseOnboardingTable,
  {
    answers: OnboardingAnswersSchema,
  },
);
export type CourseOnboardingSelect = z.infer<
  typeof courseOnboardingSelectSchema
>;

export const courseOnboardingTableRelations = relations(
  courseOnboardingTable,
  ({ one }) => ({
    user: one(userProfileTable, {
      fields: [courseOnboardingTable.userId],
      references: [userProfileTable.userId],
    }),
    course: one(coursesTable, {
      fields: [courseOnboardingTable.courseId],
      references: [coursesTable.id],
    }),
  }),
);
```

- [ ] **Step 3: Wire up the two existing relation blocks**

In `coursesTableRelations` (line 56), add a line to the returned object:

```ts
    onboarding: many(courseOnboardingTable),
```

In `userProfileTableRelations` (line 560), add a line to the returned object:

```ts
    courseOnboarding: many(courseOnboardingTable),
```

Both blocks already destructure `many`, so no signature change is needed.

- [ ] **Step 4: Verify types compile**

Run: `pnpm exec tsc --noEmit`

Expected: no new errors. Common failure: forward references. `courseOnboardingTable` is declared after `coursesTable` and `userProfileTable`, and the `references()` callbacks are lazy, so ordering is fine — but `coursesTableRelations` at line 56 refers to `courseOnboardingTable` declared at ~line 750. That is also fine, because `relations()` takes a callback that runs later. If you see a "used before declaration" error, you inlined something that should be inside a callback.

Do **not** run `pnpm exec biome check --write src/db/schema.ts` — it would reformat the entire file's quote style into an unrelated ~730-line diff.

- [ ] **Step 5: Ask the user to apply the schema**

Do not run this yourself. Post this to the user:

> Schema change is ready. Please run `pnpm db:push` to apply it, then confirm.

Once they confirm, verify against the database (via `pnpm db:studio` or psql):

- `course_onboarding` table exists with the eight columns above.
- `answers` has default `'{}'::jsonb` and is `NOT NULL`.
- `question_set_hash` and `onboarding_completed_at` are nullable.
- Unique index `course_onboarding_user_course_idx` on `(user_id, course_id)`.
- Index `course_onboarding_course_id_idx` on `(course_id)`.
- Both foreign keys are `ON DELETE CASCADE`.

- [ ] **Step 6: Commit**

Read the memory note first: the user sometimes keeps long-lived local edits in `src/db/schema.ts` and applies them himself via `pnpm db:push` rather than having them committed. At the time this plan was written `schema.ts` was clean, so staging it bundles nothing unrelated.

Before staging, confirm that:

```bash
git diff --stat src/db/schema.ts
git diff src/db/schema.ts
```

shows **only** the onboarding additions. If it shows unrelated changes the user made, stop, leave the file unstaged, and tell them — do not stage it.

If the diff is clean:

```bash
git add src/db/schema.ts
git status --short
git commit -m "feat(onboarding): add course_onboarding table"
```

---

## Done criteria

- `pnpm test` passes.
- `pnpm exec tsc --noEmit` reports no new errors.
- `course_onboarding` exists in the database with both indexes and both cascading foreign keys.
- `src/lib/course-onboarding.ts` exports `hashQuestionSet`, `pendingQuestions`, and `isOnboardingComplete`, all pure and all covered by tests.
- `#/types` exports `OnboardingAnswersSchema` and `OnboardingAnswers`.

## Explicitly out of scope

Deferred to later steps, per the spec:

- The user-facing onboarding flow and its UI.
- API routes for reading and writing onboarding responses (including the upsert that stamps `questionSetHash`).
- Admin views over collected responses, including rendering orphan answers as `(question removed)`.
- Gating course access on onboarding completion.
- Per-question versioning. The spec records the known limitation: a row-level hash cannot express per-question freshness, so a wording rewrite on an already-answered question will not re-prompt and will restamp as current.
