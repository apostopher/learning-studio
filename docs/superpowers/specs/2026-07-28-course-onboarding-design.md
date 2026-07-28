# Course Onboarding — Data Layer

**Date:** 2026-07-28
**Status:** Approved, ready for planning
**Scope:** Step 1 of the course onboarding feature — the persistence layer only.

## Context

Admins author per-course onboarding questions in
`src/components/admin/onboarding-questions-editor.tsx`. The questions are stored
on `coursesTable.onboardingQuestions` (jsonb) and shaped by
`OnboardingQuestionsSchema` in `src/types.ts`:

```ts
{ id: string; text: string }
```

Questions are free-text — there are no answer types, choices, or validation
rules on a question. So a user's answer to any question is a string.

Admins can add, rewrite, reorder, and delete questions at any time, including
after users have already answered. The design must survive that.

This spec covers only the table, its types, and the reconciliation rules the
schema must support. The user-facing onboarding flow, the API routes, and the
admin response views are later steps.

## Non-goals

- The onboarding UI or wizard flow.
- API routes for reading/writing onboarding responses.
- Admin views over collected responses.
- Gating course access on onboarding completion.
- Per-question versioning or question history (see Known limitation).

## Schema

Added to `src/db/schema.ts`.

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
    answers: jsonb("answers")
      .$type<z.infer<typeof OnboardingAnswersSchema>>()
      .notNull()
      .default({}),
    questionSetHash: varchar("question_set_hash", { length: 64 }),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      mode: "date",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("course_onboarding_user_course_idx").on(
      table.userId,
      table.courseId,
    ),
    index("course_onboarding_course_id_idx").on(table.courseId),
  ],
);
```

Alongside it, following the conventions of the surrounding tables:

- `courseOnboardingInsertSchema` / `CourseOnboardingInsert` via `createInsertSchema`
- `courseOnboardingSelectSchema` / `CourseOnboardingSelect` via `createSelectSchema`
- `courseOnboardingTableRelations` — `one(userProfileTable)`, `one(coursesTable)`
- `courseOnboarding: many(courseOnboardingTable)` added to
  `userProfileTableRelations` and `coursesTableRelations`

### Column rationale

**`userId` as `varchar(255)` referencing `userProfileTable.userId`** — not the
numeric `userProfileTable.id`. Every other user-scoped table in this schema
(`videoProgressTable`, `lessonQuizAnswersTable`, `lessonMaterialProgressTable`,
`courseSubscriptionsTable`, `favKeyPointsTable`) references `userId`.
Consistency beats the marginally tighter FK.

**`courseId` integer FK with cascade delete** — matches
`courseSubscriptionsTable`. Deleting a course removes its onboarding responses.

**Unique index on `(userId, courseId)`** — one onboarding record per user per
course. This is what makes the incremental-save upsert (`onConflictDoUpdate`)
safe against double-submit, concurrent tabs, and retried requests.

**`answers` defaults to `{}`, never null** — the row exists from the moment
onboarding opens, so "no answers yet" is an empty map. Avoids null-vs-empty
branching in every consumer.

**`questionSetHash` nullable** — null on the initial insert, before any answer
has been saved. Stamped on every answer write.

**`onboardingCompletedAt` nullable** — null means in-progress and resumable.

**Separate `course_onboarding_course_id_idx`** — admin views will query "all
onboarding responses for this course". The unique index is user-first and won't
serve that query.

## Types

Added to `src/types.ts`, beside `OnboardingQuestionsSchema`:

```ts
export const OnboardingAnswersSchema = z.record(
  z.string(),
  z.string().max(5000),
);
export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;
```

A map of `questionId → answer text`. The per-answer cap keeps a single row from
being used to stuff the jsonb column.

The hash lives in its own column rather than inside the jsonb. It is queryable
metadata, not user data — an admin query for "which users are on a stale
question set?" is then a plain `WHERE` rather than a jsonb extraction.

### Hash helper

A pure function, colocated with the existing
`src/components/admin/onboarding-helpers.ts` or in a shared util:

```ts
/** Stable hash of a course's question set: order-sensitive, over id + text. */
export const hashQuestionSet = (questions: OnboardingQuestions): string;
```

- **Order-sensitive** — reordering is a deliberate authoring act that changes
  the experience, so it should register as a change.
- **Covers `text`, not just `id`** — so wording edits are detectable.
- Output must fit `varchar(64)`.
- Must be stable across processes and deploys: no `Math.random`, no object key
  iteration order dependence, no `JSON.stringify` of an unordered structure.

## Reconciliation rules

These are the rules the schema exists to support. Later steps implement them.

### Row lifecycle

```
User opens onboarding   → INSERT (answers: {}, question_set_hash: null,
                                  onboarding_completed_at: null)
User answers a question → UPDATE answers, stamp question_set_hash
User finishes           → SET onboarding_completed_at = now()
```

The row is created on open and patched incrementally, so a user can quit and
resume. Resume state is `the row exists AND onboarding_completed_at IS NULL`.

### Pending questions

> A user's **pending questions** are the course's current questions whose `id`
> has no key in `answers`.

This is derived from the data, not from the hash. It is the source of truth for
what to prompt.

### What the hash is for

The hash records the question set this row was last reconciled against. Its jobs:

- flag a response as stale in admin views
- find users affected by a question edit

It does **not** decide re-prompting. Pending-question derivation does.

### Question set changes

When an admin changes questions after a user has answered:

- **Question added** → it has no answer key, so it is pending. Prompt only the
  pending questions. Merge the new answers into `answers` and restamp
  `questionSetHash`.
- **Question deleted** → its answer key remains in `answers` as an orphan. Do
  not delete it; it is a record of something the user actually said. Admin views
  render orphans as `(question removed)`.
- **Question reordered** → hash changes, no answers affected, nothing to prompt.
- **Question text rewritten** → the `id` is unchanged, so an answer exists and
  nothing is re-prompted. See below.

### Completion

```
isComplete = onboarding_completed_at IS NOT NULL AND pending.length === 0
```

Both conditions, not either. A user who completed onboarding before three new
questions were added is complete-but-pending, and the UI must distinguish that
state from never-started and from fully-done.

## Known limitation

**A single row-level hash cannot express per-question freshness.**

If an admin rewrites the wording of a question a user already answered, the `id`
is unchanged, so no re-prompt fires. After the next merge the row restamps to
the current hash even though that one answer was given against older wording.
The stored answer will be displayed next to question text the user never saw.

Tracking this properly requires per-question versioning or a question-history
table. That is more machinery than this feature warrants now, and it is the same
trade-off already accepted by choosing a `questionId → answer` map over storing
a snapshot of the question text with each answer.

Accepted, not overlooked. If it becomes a real problem, the fix is a question
history table — additive, and it does not invalidate this schema.

## Migration

This repo uses `db:push`, not generated migrations: `drizzle/` holds two
migrations from early commits while `src/db/schema.ts` defines roughly
twenty-five tables. Follow existing practice and apply with `pnpm db:push`.

The change is purely additive — a new table, two new relation entries, one new
zod schema. No existing table or column is modified, so there is nothing to back
out beyond dropping the table.

## Verification

- `pnpm db:push` applies cleanly against a fresh database.
- Inserting two rows with the same `(userId, courseId)` violates
  `course_onboarding_user_course_idx`.
- Deleting a course removes its onboarding rows; deleting a user profile removes
  theirs.
- `hashQuestionSet` unit tests: stable for identical input, differs on reorder,
  differs on text edit, output fits 64 chars, empty array handled.
- `OnboardingAnswersSchema` unit tests: accepts `{}`, rejects a non-string
  value, rejects an answer over 5000 characters.
