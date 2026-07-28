# Onboarding Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for a conversational onboarding agent — an XState 5 machine that conducts the intake interview described in `docs/onboarding.md`, one question at a time, and fills the `course_onboarding.answers` map built in step 1.

**Architecture:** A context-free XState machine declares the flow and the *names* of its side effects; concrete actors are injected via `.provide()`, exactly as `src/machines/auth-login-machine.ts` already does. The machine imports nothing from `ai` and nothing from `@/db`, so vitest can drive every transition with stubbed actors and no live model calls. Real actors wrap `generateText` / `generateObject`; persistence lives in a separate `src/db` module.

**Tech Stack:** XState 5.32.4 (already a dependency), AI SDK `ai@6.0.168` with gateway-routed model ids from `src/ai/ai-provider.ts`, zod v4, Drizzle + PostgreSQL, vitest, biome.

**Spec:** `docs/superpowers/specs/2026-07-28-onboarding-agent-design.md`

## Global Constraints

- **No new dependencies.** `@statelyai/agent` is deliberately not used — its documented API ships only in `2.0.0-alpha.11`, which requires XState 6 (alpha-only) and would force `@xstate/react` to a `7.x` alpha underneath the shipped auth flow. See the spec's "Key decision" section. If you find yourself wanting to `pnpm add` anything, stop and report BLOCKED.
- **Import alias: `#/` in test-reachable code, `@/` only inside `src/db/`.** Vitest cannot resolve `@/` in this repo (verified: importing a module that reaches `@/types` fails with `Cannot find package '@/types'`). `src/db/*.ts` and `src/db/schema.ts` use `@/` and are not test-importable; everything else uses `#/`.
- **Quote style is per-file, not per-repo.** biome is configured `quoteStyle: 'single'`, but `src/db/schema.ts` and `src/ai/schemas.ts` use double quotes. **Match the file you are editing.** New files use single quotes.
- **`src/db/schema.ts` already fails `biome check`** (~730 lines of pre-existing quote-style diff). **Never run biome with `--write` on it** — it would bury your change in an unrelated reformat. Read-only `biome check` is fine; expect pre-existing failures that are not yours.
- **Never `git add -A`.** Stage explicit paths and run `git status --short` before every commit. `docs/onboarding.md` and `src/common/config.ts` are the user's unrelated untracked files and must NEVER be staged.
- **Do not run `pnpm db:push`, `db:studio`, psql, or any database command.** Applying schema changes is the user's step.
- **Verified baseline on this branch (measured 2026-07-28):** `pnpm exec tsc --noEmit` completely clean; `pnpm test` 97 files / 520 passed / 28 skipped. Any tsc output or test regression is yours.
- **Vitest prints `close timed out after 10000ms / something prevents Vite server from exiting`** after the summary. Pre-existing quirk of this repo's config, **not** a failure. Judge pass/fail from the `Test Files` / `Tests` summary lines.
- Branch: `feat/onboarding-agent` (already created; spec already committed).

## Two deviations from the spec's file table, and why

1. **The machine goes in `src/machines/`, not `src/lib/`.** The spec said `src/lib/onboarding-machine.ts` to guarantee vitest-importability, but `src/machines/auth-login-machine.ts` is the established home for machines and is already tested under vitest. The importability requirement is satisfied either way — it comes from *what a file imports*, not where it lives. Following the existing convention wins.
2. **`src/machines/auth-login-machine.ts` deliberately keeps flow data in jotai, never XState context.** That rule exists because it is a *client* machine feeding React. The onboarding machine runs **server-side per request**, where jotai has no place — so it uses XState context, as the spec specifies. Do not "fix" this to match the auth machine.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/types.ts` | Modify | Add `OnboardingConsentEvaluationSchema` and `OnboardingReplyEvaluationSchema` beside the existing onboarding schemas. All onboarding contracts live here. |
| `src/lib/course-onboarding.ts` | Modify | Add `shouldOfferOnboarding`. |
| `src/lib/onboarding-default-questions.ts` | Create | `DEFAULT_ONBOARDING_QUESTIONS` with reserved `core:*` ids. |
| `src/lib/onboarding-session.ts` | Create | `resolveQuestionSet` — pure fallback logic + source freezing. |
| `src/machines/onboarding-machine.ts` | Create | The machine. No `ai`, no `@/db` imports. |
| `src/ai/prompts/onboarding.ts` | Create | Persona/system prompt built from `docs/onboarding.md`. |
| `src/ai/onboarding/*.ts` | Create | The six actor implementations. |
| `src/db/course-onboarding.ts` | Create | Persistence. |
| `src/db/schema.ts` | Modify | Two columns + the messages table. |
| `src/machines/onboarding-implementations.ts` | Create | Wires real actors + persistence into `machine.provide()`. |

Tests mirror this: `src/__tests__/` for `src/types.ts`, `src/lib/__tests__/`, `src/machines/__tests__/`, `src/ai/__tests__/`.

---

## Task 1: Schema — two columns and the messages table

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Consumes: `courseOnboardingTable`, `userProfileTable`, `coursesTable` (already present).
- Produces: `courseOnboardingTable.questionSource`, `courseOnboardingTable.consentDeclinedAt`, `courseOnboardingMessagesTable`, `courseOnboardingMessagesInsertSchema` / `CourseOnboardingMessagesInsert`, `courseOnboardingMessagesSelectSchema` / `CourseOnboardingMessagesSelect`, `courseOnboardingMessagesTableRelations`.

**No unit test, same rationale as step 1:** a Drizzle table declaration is configuration, and `src/db/schema.ts` cannot be imported under vitest (it imports `@/types`). `tsc --noEmit` is the verification. Scrutinise the declaration carefully, because nothing else guards it.

- [ ] **Step 1: Add the two columns**

In `src/db/schema.ts`, inside `courseOnboardingTable`, after the `questionSetHash` column and before `onboardingCompletedAt`. Use **double quotes** to match the file:

```ts
    // 'admin' | 'default' — the question source, frozen when the row is
    // created. Without this, an admin adding the first question to a course
    // would flip the effective set, orphan every default answer, and
    // re-interview users who had already finished.
    questionSource: varchar("question_source", { length: 16 }),
    // Set when the user declines the consent framing. The row persists with an
    // empty answers map so onboarding is never auto-offered again — declining
    // is respected, not re-pitched on the next visit.
    consentDeclinedAt: timestamp("consent_declined_at", { mode: "date" }),
```

Both nullable: existing rows predate them.

- [ ] **Step 2: Add the messages table**

In `src/db/schema.ts`, immediately after `courseOnboardingTableRelations`:

```ts
export const courseOnboardingMessagesTable = pgTable(
  "course_onboarding_messages",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    onboardingId: integer("onboarding_id")
      .notNull()
      .references(() => courseOnboardingTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull(), // 'assistant' | 'user'
    // Mirrors aiMessages.parts so these rows are compatible with the AI SDK
    // UIMessage shape when the UI is wired.
    parts: jsonb("parts").notNull(),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    // A retried request must not append the same turn twice.
    uniqueIndex("course_onboarding_messages_onboarding_order_idx").on(
      table.onboardingId,
      table.order,
    ),
    index("course_onboarding_messages_onboarding_id_idx").on(
      table.onboardingId,
    ),
  ],
);

export const courseOnboardingMessagesInsertSchema = createInsertSchema(
  courseOnboardingMessagesTable,
);
export type CourseOnboardingMessagesInsert = z.infer<
  typeof courseOnboardingMessagesInsertSchema
>;

export const courseOnboardingMessagesSelectSchema = createSelectSchema(
  courseOnboardingMessagesTable,
);
export type CourseOnboardingMessagesSelect = z.infer<
  typeof courseOnboardingMessagesSelectSchema
>;

export const courseOnboardingMessagesTableRelations = relations(
  courseOnboardingMessagesTable,
  ({ one }) => ({
    onboarding: one(courseOnboardingTable, {
      fields: [courseOnboardingMessagesTable.onboardingId],
      references: [courseOnboardingTable.id],
    }),
  }),
);
```

Note: no `answers`-style column override is needed on these two schemas, so plain `createInsertSchema(table)` is correct here. (Step 1's `answers` needed `.optional()` because a column override discards drizzle-zod's default-derived optionality — that does not apply to any column on this table.)

- [ ] **Step 3: Wire the parent relation**

In `courseOnboardingTableRelations`, change the callback destructure from `({ one })` to `({ one, many })` and add to the returned object:

```ts
    messages: many(courseOnboardingMessagesTable),
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm exec tsc --noEmit`

Expected: zero output. The baseline is clean, so any error is yours.

Do **not** run `pnpm exec biome check --write src/db/schema.ts`.

- [ ] **Step 5: Commit**

First confirm the diff contains only your additions — the user sometimes keeps local edits in this file:

```bash
git diff src/db/schema.ts
git add src/db/schema.ts
git status --short
git commit -m "feat(onboarding): add question source, consent decline, and messages table"
```

If `git diff` shows unrelated changes, STOP and report BLOCKED rather than staging them.

---

## Task 2: `shouldOfferOnboarding`

**Files:**
- Modify: `src/lib/course-onboarding.ts` (append)
- Test: `src/lib/__tests__/course-onboarding.test.ts` (append a describe block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `shouldOfferOnboarding(row: OnboardingOfferState | null): boolean`, and the exported type `OnboardingOfferState = { onboardingCompletedAt: Date | null; consentDeclinedAt: Date | null }`.

This file already exports `hashQuestionSet`, `pendingQuestions`, and `isOnboardingComplete`. Append; do not reorder what is there.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/course-onboarding.test.ts`. Extend the existing import from `#/lib/course-onboarding` to include `shouldOfferOnboarding`, then add:

```ts
describe('shouldOfferOnboarding', () => {
  it('offers when there is no row at all', () => {
    expect(shouldOfferOnboarding(null)).toBe(true);
  });

  it('offers when the row exists but is untouched', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: null,
        consentDeclinedAt: null,
      }),
    ).toBe(true);
  });

  it('does not offer once onboarding is complete', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: new Date(0),
        consentDeclinedAt: null,
      }),
    ).toBe(false);
  });

  it('does not offer once consent was declined', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: null,
        consentDeclinedAt: new Date(0),
      }),
    ).toBe(false);
  });

  it('does not offer when both are set', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: new Date(0),
        consentDeclinedAt: new Date(0),
      }),
    ).toBe(false);
  });

  it('does not offer when a timestamp arrives as undefined', () => {
    // Loose null checks, same reasoning as isOnboardingComplete.
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: undefined as unknown as null,
        consentDeclinedAt: null,
      }),
    ).toBe(true);
    expect(
      shouldOfferOnboarding(undefined as unknown as null),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/course-onboarding.test.ts`

Expected: FAIL — `shouldOfferOnboarding` is not exported. The existing tests in the file will also fail to run, because the import at the top fails.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/course-onboarding.ts`:

```ts
export type OnboardingOfferState = {
  onboardingCompletedAt: Date | null;
  consentDeclinedAt: Date | null;
};

/**
 * Whether onboarding should be offered to this user for this course.
 *
 * A declined consent is a decision, not a pending task: it suppresses the
 * offer permanently. The user can still start onboarding themselves — this
 * governs only whether we bring it up.
 *
 * Deliberately NOT folded into isOnboardingComplete: someone who declined is
 * not complete, they opted out, and conflating the two would make an opt-out
 * indistinguishable from a finished interview in any admin view.
 *
 * Loose null checks (`== null`) are deliberate — do not tighten to `===`.
 * They catch a timestamp arriving as undefined across a serialization
 * boundary, same as isOnboardingComplete above.
 */
export const shouldOfferOnboarding = (
  row: OnboardingOfferState | null,
): boolean =>
  row == null ||
  (row.onboardingCompletedAt == null && row.consentDeclinedAt == null);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/course-onboarding.test.ts`

Expected: PASS, 31 tests (25 existing + 6 new).

- [ ] **Step 5: Check formatting and types**

Run: `pnpm exec biome check src/lib/course-onboarding.ts src/lib/__tests__/course-onboarding.test.ts`
Run: `pnpm exec tsc --noEmit`

Expected: no errors from either.

- [ ] **Step 6: Commit**

```bash
git add src/lib/course-onboarding.ts src/lib/__tests__/course-onboarding.test.ts
git status --short
git commit -m "feat(onboarding): add shouldOfferOnboarding"
```

---

## Task 3: Default questions and effective-set resolution

**Files:**
- Create: `src/lib/onboarding-default-questions.ts`
- Create: `src/lib/onboarding-session.ts`
- Test: `src/lib/__tests__/onboarding-default-questions.test.ts`
- Test: `src/lib/__tests__/onboarding-session.test.ts`

**Interfaces:**
- Consumes: `OnboardingQuestions`, `OnboardingQuestionsSchema` from `#/types`.
- Produces:
  - `DEFAULT_ONBOARDING_QUESTIONS: OnboardingQuestions`
  - `type OnboardingQuestionSource = 'admin' | 'default'`
  - `resolveQuestionSet(courseQuestions: OnboardingQuestions, frozenSource?: OnboardingQuestionSource | null): { questions: OnboardingQuestions; source: OnboardingQuestionSource }`

**The ids are permanent.** They are persisted answer keys — changing one orphans every answer already stored under it. They are namespaced `core:` so they cannot collide with admin question ids, which are `crypto.randomUUID()`.

- [ ] **Step 1: Write the failing test for the defaults**

Create `src/lib/__tests__/onboarding-default-questions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import { OnboardingQuestionsSchema } from '#/types';

describe('DEFAULT_ONBOARDING_QUESTIONS', () => {
  it('is a valid onboarding question set', () => {
    expect(OnboardingQuestionsSchema.safeParse(DEFAULT_ONBOARDING_QUESTIONS)
      .success).toBe(true);
  });

  it('covers the five themes from docs/onboarding.md', () => {
    expect(DEFAULT_ONBOARDING_QUESTIONS.map((q) => q.id)).toEqual([
      'core:background',
      'core:motivation',
      'core:learning-style',
      'core:schedule',
      'core:exam',
    ]);
  });

  it('namespaces every id so it cannot collide with an admin uuid', () => {
    for (const q of DEFAULT_ONBOARDING_QUESTIONS) {
      expect(q.id.startsWith('core:')).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = DEFAULT_ONBOARDING_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every question non-empty text', () => {
    for (const q of DEFAULT_ONBOARDING_QUESTIONS) {
      expect(q.text.trim().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/onboarding-default-questions.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the defaults**

Create `src/lib/onboarding-default-questions.ts`:

```ts
import type { OnboardingQuestions } from '#/types';

/**
 * The built-in intake question set, derived from the Structure section of
 * docs/onboarding.md. Used only when a course has no admin-authored
 * questions.
 *
 * These ids are PERMANENT — they are persisted as answer keys, so changing
 * one orphans every answer already stored under it. The `core:` namespace
 * keeps them clear of admin question ids, which are crypto.randomUUID().
 *
 * The text is a starting point for the agent, not a script. docs/onboarding.md
 * requires the agent to phrase questions naturally and follow up rather than
 * read a form aloud.
 */
export const DEFAULT_ONBOARDING_QUESTIONS: OnboardingQuestions = [
  {
    id: 'core:background',
    text: "What's your background — the work you've done, any training or qualifications, and how much time you've spent around aircraft or drones so far?",
  },
  {
    id: 'core:motivation',
    text: 'What made you sign up for this course, and what would make it worth your time by the end?',
  },
  {
    id: 'core:learning-style',
    text: 'How do you learn best? Some people want to move fast and fill gaps later, others would rather go slowly and revisit a lesson until it really lands.',
  },
  {
    id: 'core:schedule',
    text: 'Realistically, how often do you expect to sit down with this, and what time of day tends to work best for you?',
  },
  {
    id: 'core:exam',
    text: "How are you feeling about the final interview and exam at the end — anything you're hoping for, or anything you'd rather not be blindsided by?",
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/onboarding-default-questions.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for resolution**

Create `src/lib/__tests__/onboarding-session.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import { resolveQuestionSet } from '#/lib/onboarding-session';
import type { OnboardingQuestions } from '#/types';

const ADMIN: OnboardingQuestions = [
  { id: 'a1b2', text: 'Which airframe do you fly most?' },
  { id: 'c3d4', text: 'What does a good sortie look like to you?' },
];

describe('resolveQuestionSet', () => {
  it('uses the admin questions when the course has any', () => {
    expect(resolveQuestionSet(ADMIN)).toEqual({
      questions: ADMIN,
      source: 'admin',
    });
  });

  it('falls back to the defaults when the course has none', () => {
    expect(resolveQuestionSet([])).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });

  it('honours a frozen default source even after admin questions appear', () => {
    // The whole point of freezing: a user who onboarded on defaults must not
    // be re-interviewed when an admin later adds questions.
    expect(resolveQuestionSet(ADMIN, 'default')).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });

  it('honours a frozen admin source even after the admin deletes every question', () => {
    expect(resolveQuestionSet([], 'admin')).toEqual({
      questions: [],
      source: 'admin',
    });
  });

  it('treats a null frozen source as unfrozen and resolves fresh', () => {
    // Rows created before question_source existed.
    expect(resolveQuestionSet(ADMIN, null)).toEqual({
      questions: ADMIN,
      source: 'admin',
    });
    expect(resolveQuestionSet([], null)).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });

  it('treats an undefined frozen source as unfrozen', () => {
    expect(resolveQuestionSet([], undefined)).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/onboarding-session.test.ts`

Expected: FAIL — `#/lib/onboarding-session` does not exist.

- [ ] **Step 7: Write the resolution logic**

Create `src/lib/onboarding-session.ts`:

```ts
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import type { OnboardingQuestions } from '#/types';

export type OnboardingQuestionSource = 'admin' | 'default';

export type ResolvedQuestionSet = {
  questions: OnboardingQuestions;
  source: OnboardingQuestionSource;
};

/**
 * The effective question set for an onboarding row.
 *
 * Fallback, not merge: admin questions win when the course has any, otherwise
 * the built-in defaults. Resolved once when the row is created and then frozen
 * in course_onboarding.question_source.
 *
 * `frozenSource` null/undefined means the row predates the column, so resolve
 * fresh — correct, because such rows have no answers yet.
 */
export const resolveQuestionSet = (
  courseQuestions: OnboardingQuestions,
  frozenSource?: OnboardingQuestionSource | null,
): ResolvedQuestionSet => {
  const source: OnboardingQuestionSource =
    frozenSource ?? (courseQuestions.length > 0 ? 'admin' : 'default');

  return {
    questions: source === 'admin' ? courseQuestions : DEFAULT_ONBOARDING_QUESTIONS,
    source,
  };
};
```

- [ ] **Step 8: Run both test files to verify they pass**

Run: `pnpm vitest run src/lib/__tests__/onboarding-default-questions.test.ts src/lib/__tests__/onboarding-session.test.ts`

Expected: PASS, 11 tests across 2 files.

- [ ] **Step 9: Check formatting and types**

Run: `pnpm exec biome check src/lib/onboarding-default-questions.ts src/lib/onboarding-session.ts src/lib/__tests__/onboarding-default-questions.test.ts src/lib/__tests__/onboarding-session.test.ts`
Run: `pnpm exec tsc --noEmit`

- [ ] **Step 10: Commit**

```bash
git add src/lib/onboarding-default-questions.ts src/lib/onboarding-session.ts src/lib/__tests__/onboarding-default-questions.test.ts src/lib/__tests__/onboarding-session.test.ts
git status --short
git commit -m "feat(onboarding): add default question set and effective-set resolution"
```

---

## Task 4: Actor output schemas

**Files:**
- Modify: `src/types.ts` (append after the onboarding schemas, around line 77)
- Test: `src/__tests__/onboarding-evaluation-schemas.test.ts`

**Interfaces:**
- Produces:
  - `OnboardingConsentEvaluationSchema` / `type OnboardingConsentEvaluation`
  - `OnboardingReplyEvaluationSchema` / `type OnboardingReplyEvaluation`

These are the machine's contract with its actors. They live in `src/types.ts` beside `OnboardingQuestionsSchema` and `OnboardingAnswersSchema` so every onboarding contract is in one place, and because `src/types.ts` is pure zod and importable from both `src/machines/` and `src/ai/`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/onboarding-evaluation-schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  OnboardingConsentEvaluationSchema,
  OnboardingReplyEvaluationSchema,
} from '#/types';

describe('OnboardingConsentEvaluationSchema', () => {
  it.each(['consented', 'declined', 'needs_clarification'])(
    'accepts status %s',
    (status) => {
      const r = OnboardingConsentEvaluationSchema.safeParse({
        status,
        reply: null,
      });
      expect(r.success).toBe(true);
    },
  );

  it('accepts a reply string', () => {
    const r = OnboardingConsentEvaluationSchema.safeParse({
      status: 'needs_clarification',
      reply: 'We use it to pace the course, nothing else.',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const r = OnboardingConsentEvaluationSchema.safeParse({
      status: 'maybe',
      reply: null,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a missing reply key', () => {
    const r = OnboardingConsentEvaluationSchema.safeParse({
      status: 'consented',
    });
    expect(r.success).toBe(false);
  });
});

describe('OnboardingReplyEvaluationSchema', () => {
  it.each([
    'answered',
    'needs_follow_up',
    'declined',
    'wants_pause',
    'wants_delete',
  ])('accepts status %s', (status) => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status,
      answer: null,
      followUp: null,
      hesitancy: false,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a full answered evaluation', () => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status: 'answered',
      answer: 'Two years, mostly FPV.',
      followUp: null,
      hesitancy: false,
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status: 'skipped',
      answer: null,
      followUp: null,
      hesitancy: false,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-boolean hesitancy', () => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status: 'answered',
      answer: 'x',
      followUp: null,
      hesitancy: 'yes',
    });
    expect(r.success).toBe(false);
  });

  it('rejects an answer over 5000 chars, matching the storage cap', () => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status: 'answered',
      answer: 'x'.repeat(5001),
      followUp: null,
      hesitancy: false,
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/__tests__/onboarding-evaluation-schemas.test.ts`

Expected: FAIL — neither schema is exported from `#/types`.

- [ ] **Step 3: Write the schemas**

In `src/types.ts`, after the `OnboardingAnswers` type export, add (single quotes, matching the file):

```ts
/** The consent gate's decision. Nothing is asked until this returns consented. */
export const OnboardingConsentEvaluationSchema = z.object({
  status: z.enum(['consented', 'declined', 'needs_clarification']),
  reply: z.string().max(2000).nullable(),
});
export type OnboardingConsentEvaluation = z.infer<
  typeof OnboardingConsentEvaluationSchema
>;

/**
 * What a user's reply to an onboarding question means. `status` is the pivot
 * that turns free text into a state transition.
 *
 * The 5000-char cap on `answer` matches OnboardingAnswersSchema's per-answer
 * cap — an evaluation that could not be stored is not a valid evaluation.
 */
export const OnboardingReplyEvaluationSchema = z.object({
  status: z.enum([
    'answered',
    'needs_follow_up',
    'declined',
    'wants_pause',
    'wants_delete',
  ]),
  answer: z.string().max(5000).nullable(),
  followUp: z.string().max(2000).nullable(),
  hesitancy: z.boolean(),
});
export type OnboardingReplyEvaluation = z.infer<
  typeof OnboardingReplyEvaluationSchema
>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/__tests__/onboarding-evaluation-schemas.test.ts`

Expected: PASS, 15 tests.

- [ ] **Step 5: Check formatting and types**

Run: `pnpm exec biome check src/types.ts src/__tests__/onboarding-evaluation-schemas.test.ts`
Run: `pnpm exec tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/__tests__/onboarding-evaluation-schemas.test.ts
git status --short
git commit -m "feat(onboarding): add consent and reply evaluation schemas"
```

---

## Task 5: The machine — consent gate

**Files:**
- Create: `src/machines/onboarding-machine.ts`
- Test: `src/machines/__tests__/onboarding-machine.test.ts`

**Interfaces:**
- Consumes: `OnboardingQuestions`, `OnboardingAnswers`, `OnboardingConsentEvaluation` from `#/types`; `OnboardingQuestionSource` from `#/lib/onboarding-session`.
- Produces: `onboardingMachine`, `type OnboardingContext`, `type OnboardingEvent`, `type OnboardingInput`, `CONSENT_CLARIFICATION_CAP`.

This task builds the machine up to the point where consent is granted. `asking` exists as a state but does nothing yet — Task 6 fills in the question loop. A partial machine is fine; XState machines are declarative.

**Pattern to follow:** `src/machines/auth-login-machine.ts` — `setup({ types, actors, actions })` with placeholder actor implementations, then `.createMachine({...})`. Real implementations arrive via `.provide()`. Do **not** import `ai` or `@/db` here.

**Deviation from that file to be aware of:** the auth machine keeps all flow data in jotai and none in XState context, because it is a client machine feeding React. This machine runs server-side per request, so it uses XState context. That is intentional — see the plan header.

- [ ] **Step 1: Write the failing test**

Create `src/machines/__tests__/onboarding-machine.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import {
  CONSENT_CLARIFICATION_CAP,
  onboardingMachine,
} from '#/machines/onboarding-machine';
import type { OnboardingConsentEvaluation } from '#/types';

const INPUT = {
  onboardingId: 1,
  courseId: 10,
  userId: 'user_1',
  questions: DEFAULT_ONBOARDING_QUESTIONS,
  source: 'default' as const,
  answers: {},
};

/**
 * Builds an actor with stubbed AI actors. `consentVerdicts` is consumed one
 * per evaluateConsent call, so a test can script a clarification loop.
 */
function makeActor(consentVerdicts: OnboardingConsentEvaluation[]) {
  const queue = [...consentVerdicts];
  const declineConsent = vi.fn(async () => {});

  const actor = createActor(
    onboardingMachine.provide({
      actors: {
        greet: fromPromise(async () => 'Welcome — before we start…'),
        evaluateConsent: fromPromise(async () => {
          const next = queue.shift();
          if (!next) throw new Error('evaluateConsent called more than scripted');
          return next;
        }),
        signOff: fromPromise(async () => 'No problem at all. Enjoy the course.'),
        declineConsent: fromPromise(declineConsent),
      },
    }),
    { input: INPUT },
  );

  return { actor, declineConsent };
}

const consented: OnboardingConsentEvaluation = {
  status: 'consented',
  reply: null,
};
const declined: OnboardingConsentEvaluation = {
  status: 'declined',
  reply: null,
};
const unclear: OnboardingConsentEvaluation = {
  status: 'needs_clarification',
  reply: 'We only use it to pace the course.',
};

describe('onboardingMachine — consent gate', () => {
  it('waits for the user after greeting', async () => {
    const { actor } = makeActor([consented]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    expect(actor.getSnapshot().matches('awaitingConsent')).toBe(true);
  });

  it('proceeds to asking once consent is given', async () => {
    const { actor } = makeActor([consented]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'sure, go ahead' });
    await waitFor(actor, (s) => s.matches('asking'));
    expect(actor.getSnapshot().matches('asking')).toBe(true);
  });

  it('signs off and records the decline when consent is refused', async () => {
    const { actor, declineConsent } = makeActor([declined]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: "I'd rather not" });
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('consentDeclined')).toBe(true);
    expect(declineConsent).toHaveBeenCalledTimes(1);
  });

  it('never asks a question and leaves answers empty when consent is refused', async () => {
    // This is the invariant the gate exists to guarantee.
    const { actor } = makeActor([declined]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'no thanks' });
    await waitFor(actor, (s) => s.status === 'done');
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.answers).toEqual({});
    expect(snapshot.context.currentQuestionId).toBeNull();
  });

  it('loops back to greeting for a clarification, then proceeds', async () => {
    const { actor } = makeActor([unclear, consented]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'what do you do with this?' });
    await waitFor(actor, (s) => s.context.consentClarificationCount === 1);
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'ok that makes sense' });
    await waitFor(actor, (s) => s.matches('asking'));
    expect(actor.getSnapshot().matches('asking')).toBe(true);
  });

  it('treats a capped-out clarification loop as declined', async () => {
    // Consent must be affirmative — an unresolved signal is not a yes.
    const { actor, declineConsent } = makeActor(
      Array.from({ length: CONSENT_CLARIFICATION_CAP + 1 }, () => unclear),
    );
    actor.start();
    for (let i = 0; i <= CONSENT_CLARIFICATION_CAP; i++) {
      await waitFor(actor, (s) => s.matches('awaitingConsent'));
      actor.send({ type: 'REPLY', text: 'but why?' });
      if (i < CONSENT_CLARIFICATION_CAP) {
        await waitFor(actor, (s) => s.context.consentClarificationCount === i + 1);
      }
    }
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('consentDeclined')).toBe(true);
    expect(declineConsent).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/machines/__tests__/onboarding-machine.test.ts`

Expected: FAIL — `#/machines/onboarding-machine` does not exist.

- [ ] **Step 3: Write the machine**

Create `src/machines/onboarding-machine.ts`:

```ts
import { assign, fromPromise, setup } from 'xstate';
import type { OnboardingQuestionSource } from '#/lib/onboarding-session';
import type {
  OnboardingAnswers,
  OnboardingConsentEvaluation,
  OnboardingQuestions,
} from '#/types';

/**
 * How many times the agent will clarify before treating the reply as a
 * refusal. Consent must be affirmative: proceeding to collect background,
 * schedule, and career information on an unresolved signal is the wrong
 * default.
 */
export const CONSENT_CLARIFICATION_CAP = 2;

export type OnboardingInput = {
  onboardingId: number;
  courseId: number;
  userId: string;
  questions: OnboardingQuestions;
  source: OnboardingQuestionSource;
  answers: OnboardingAnswers;
};

export type OnboardingContext = OnboardingInput & {
  currentQuestionId: string | null;
  followUpCount: number;
  consentClarificationCount: number;
  turnCount: number;
  lastReply: string | null;
};

export type OnboardingEvent =
  | { type: 'REPLY'; text: string }
  | { type: 'PAUSE' }
  | { type: 'DELETE' };

export const onboardingMachine = setup({
  types: {
    context: {} as OnboardingContext,
    events: {} as OnboardingEvent,
    input: {} as OnboardingInput,
  },
  actors: {
    greet: fromPromise<string, { context: OnboardingContext }>(async () => ''),
    evaluateConsent: fromPromise<
      OnboardingConsentEvaluation,
      { context: OnboardingContext; reply: string }
    >(async () => ({ status: 'declined', reply: null })),
    signOff: fromPromise<string, { context: OnboardingContext }>(async () => ''),
    declineConsent: fromPromise<void, { onboardingId: number }>(async () => {}),
  },
}).createMachine({
  id: 'onboarding',
  context: ({ input }) => ({
    ...input,
    currentQuestionId: null,
    followUpCount: 0,
    consentClarificationCount: 0,
    turnCount: 0,
    lastReply: null,
  }),
  initial: 'greeting',
  states: {
    greeting: {
      invoke: {
        src: 'greet',
        input: ({ context }) => ({ context }),
        onDone: { target: 'awaitingConsent' },
        onError: { target: 'failed' },
      },
    },

    awaitingConsent: {
      on: {
        REPLY: {
          target: 'evaluatingConsent',
          actions: assign({
            lastReply: ({ event }) => event.text,
            turnCount: ({ context }) => context.turnCount + 1,
          }),
        },
        PAUSE: { target: 'paused' },
        DELETE: { target: 'deleted' },
      },
    },

    evaluatingConsent: {
      invoke: {
        src: 'evaluateConsent',
        input: ({ context }) => ({
          context,
          reply: context.lastReply ?? '',
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.status === 'consented',
            target: 'asking',
          },
          {
            // Under the cap: answer the question they raised, then re-ask.
            guard: ({ context, event }) =>
              event.output.status === 'needs_clarification' &&
              context.consentClarificationCount < CONSENT_CLARIFICATION_CAP,
            target: 'greeting',
            actions: assign({
              consentClarificationCount: ({ context }) =>
                context.consentClarificationCount + 1,
            }),
          },
          {
            // Declined, or clarification exhausted. Both are a no.
            target: 'signingOff',
          },
        ],
        onError: { target: 'failed' },
      },
    },

    signingOff: {
      invoke: {
        src: 'signOff',
        input: ({ context }) => ({ context }),
        onDone: { target: 'recordingDecline' },
        onError: { target: 'recordingDecline' },
      },
    },

    recordingDecline: {
      invoke: {
        src: 'declineConsent',
        input: ({ context }) => ({ onboardingId: context.onboardingId }),
        onDone: { target: 'consentDeclined' },
        onError: { target: 'failed' },
      },
    },

    // Filled in by the next task.
    asking: {},

    consentDeclined: { type: 'final' },
    paused: { type: 'final' },
    deleted: { type: 'final' },
    failed: { type: 'final' },
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/machines/__tests__/onboarding-machine.test.ts`

Expected: PASS, 6 tests.

If `waitFor` times out, the usual cause is a guard that never matches — add a temporary `actor.subscribe((s) => console.log(s.value))` to see where it parks, and remove it before committing.

- [ ] **Step 5: Check formatting and types**

Run: `pnpm exec biome check src/machines/onboarding-machine.ts src/machines/__tests__/onboarding-machine.test.ts`
Run: `pnpm exec tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/machines/onboarding-machine.ts src/machines/__tests__/onboarding-machine.test.ts
git status --short
git commit -m "feat(onboarding): add machine consent gate"
```

---

## Task 6: The machine — question loop and completion

**Files:**
- Modify: `src/machines/onboarding-machine.ts`
- Test: `src/machines/__tests__/onboarding-machine.test.ts` (append)

**Interfaces:**
- Consumes: everything from Task 5, plus `pendingQuestions` from `#/lib/course-onboarding` and `OnboardingReplyEvaluation` from `#/types`.
- Produces: `FOLLOW_UP_CAP`, `HESITANCY_TURN_THRESHOLD`, and the filled-in `asking` / `awaitingAnswer` / `evaluating` / `persisting` / `summarising` / `confirming` / `complete` states.

**`currentQuestionId` is derived, never independently tracked** — it comes from `pendingQuestions(questions, answers)[0]`. Keeping step 1's helper as the single source of truth is what stops the machine drifting from persisted state on resume.

- [ ] **Step 1: Write the failing tests**

Append to `src/machines/__tests__/onboarding-machine.test.ts`. Extend the top imports to add `FOLLOW_UP_CAP` from `#/machines/onboarding-machine` and `OnboardingReplyEvaluation` from `#/types`, then add a second builder and the block below:

```ts
/** Actor already past the consent gate, with scripted reply verdicts. */
function makeAnsweringActor(
  replyVerdicts: OnboardingReplyEvaluation[],
  questions = DEFAULT_ONBOARDING_QUESTIONS,
) {
  const queue = [...replyVerdicts];
  const saveAnswer = vi.fn(async () => {});
  const completeOnboarding = vi.fn(async () => {});
  const deleteOnboarding = vi.fn(async () => {});

  const actor = createActor(
    onboardingMachine.provide({
      actors: {
        greet: fromPromise(async () => 'Welcome…'),
        evaluateConsent: fromPromise(async () => ({
          status: 'consented' as const,
          reply: null,
        })),
        signOff: fromPromise(async () => 'bye'),
        declineConsent: fromPromise(async () => {}),
        askQuestion: fromPromise(async () => 'So, tell me a bit about you?'),
        evaluateReply: fromPromise(async () => {
          const next = queue.shift();
          if (!next) throw new Error('evaluateReply called more than scripted');
          return next;
        }),
        saveAnswer: fromPromise(saveAnswer),
        summarise: fromPromise(async () => "Here's what I heard…"),
        completeOnboarding: fromPromise(completeOnboarding),
        deleteOnboarding: fromPromise(deleteOnboarding),
      },
    }),
    { input: { ...INPUT, questions } },
  );

  return { actor, saveAnswer, completeOnboarding, deleteOnboarding };
}

const answered = (answer: string): OnboardingReplyEvaluation => ({
  status: 'answered',
  answer,
  followUp: null,
  hesitancy: false,
});

const vague: OnboardingReplyEvaluation = {
  status: 'needs_follow_up',
  answer: null,
  followUp: 'Could you say a bit more?',
  hesitancy: false,
};

/** Drives the actor from start through the consent gate to the first question. */
async function reachAsking(actor: ReturnType<typeof makeAnsweringActor>['actor']) {
  actor.start();
  await waitFor(actor, (s) => s.matches('awaitingConsent'));
  actor.send({ type: 'REPLY', text: 'yes' });
  await waitFor(actor, (s) => s.matches('awaitingAnswer'));
}

describe('onboardingMachine — question loop', () => {
  const ONE: OnboardingQuestions = [{ id: 'q1', text: 'Only question?' }];

  it('asks the first pending question', async () => {
    const { actor } = makeAnsweringActor([answered('yes')], ONE);
    await reachAsking(actor);
    expect(actor.getSnapshot().context.currentQuestionId).toBe('q1');
  });

  it('persists an answer and completes when nothing is left pending', async () => {
    const { actor, saveAnswer, completeOnboarding } = makeAnsweringActor(
      [answered('Two years, mostly FPV.')],
      ONE,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: 'two years, mostly FPV' });
    await waitFor(actor, (s) => s.matches('confirming'));
    actor.send({ type: 'CONFIRM' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('complete')).toBe(true);
    expect(saveAnswer).toHaveBeenCalledTimes(1);
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(actor.getSnapshot().context.answers).toEqual({
      q1: 'Two years, mostly FPV.',
    });
  });

  it('follows up on a vague reply without persisting an answer', async () => {
    const { actor, saveAnswer } = makeAnsweringActor(
      [vague, answered('Two years.')],
      ONE,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: 'a bit' });
    await waitFor(actor, (s) => s.context.followUpCount === 1);
    expect(saveAnswer).not.toHaveBeenCalled();
    await waitFor(actor, (s) => s.matches('awaitingAnswer'));
  });

  it('stops following up at the cap and takes the reply as the answer', async () => {
    // Without a cap, a user giving vague answers loops forever.
    const { actor, saveAnswer } = makeAnsweringActor(
      Array.from({ length: FOLLOW_UP_CAP + 1 }, () => vague),
      ONE,
    );
    await reachAsking(actor);
    for (let i = 0; i <= FOLLOW_UP_CAP; i++) {
      await waitFor(actor, (s) => s.matches('awaitingAnswer'));
      actor.send({ type: 'REPLY', text: 'dunno' });
      if (i < FOLLOW_UP_CAP) {
        await waitFor(actor, (s) => s.context.followUpCount === i + 1);
      }
    }
    await waitFor(actor, (s) => saveAnswer.mock.calls.length === 1);
    expect(saveAnswer).toHaveBeenCalledTimes(1);
  });

  it('resets the follow-up count when moving to the next question', async () => {
    const TWO: OnboardingQuestions = [
      { id: 'q1', text: 'First?' },
      { id: 'q2', text: 'Second?' },
    ];
    const { actor } = makeAnsweringActor([vague, answered('a'), answered('b')], TWO);
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: 'hmm' });
    await waitFor(actor, (s) => s.context.followUpCount === 1);
    await waitFor(actor, (s) => s.matches('awaitingAnswer'));
    actor.send({ type: 'REPLY', text: 'ok here is more' });
    await waitFor(actor, (s) => s.context.currentQuestionId === 'q2');
    expect(actor.getSnapshot().context.followUpCount).toBe(0);
  });

  it('stores an empty string for a declined question so it never re-prompts', async () => {
    const { actor, saveAnswer } = makeAnsweringActor(
      [
        {
          status: 'declined',
          answer: null,
          followUp: null,
          hesitancy: true,
        },
      ],
      ONE,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: "I'd rather not say" });
    await waitFor(actor, (s) => s.matches('confirming'));
    expect(saveAnswer).toHaveBeenCalledTimes(1);
    expect(actor.getSnapshot().context.answers).toEqual({ q1: '' });
  });

  it('pauses on request, leaving the row incomplete', async () => {
    const { actor, completeOnboarding } = makeAnsweringActor([], ONE);
    await reachAsking(actor);
    actor.send({ type: 'PAUSE' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('paused')).toBe(true);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it('deletes on request', async () => {
    const { actor, deleteOnboarding } = makeAnsweringActor([], ONE);
    await reachAsking(actor);
    actor.send({ type: 'DELETE' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('deleted')).toBe(true);
    expect(deleteOnboarding).toHaveBeenCalledTimes(1);
  });

  it('re-summarises when the user corrects the summary', async () => {
    const { actor, completeOnboarding } = makeAnsweringActor(
      [answered('Two years.')],
      ONE,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: 'two years' });
    await waitFor(actor, (s) => s.matches('confirming'));
    actor.send({ type: 'REPLY', text: 'actually it was three years' });
    await waitFor(actor, (s) => s.matches('summarising'));
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it('skips straight to summarising when every question is already answered', async () => {
    // The resume case: a returning user with a full answers map.
    const resumed = createActor(
      onboardingMachine.provide({
        actors: {
          greet: fromPromise(async () => 'Welcome back…'),
          evaluateConsent: fromPromise(async () => ({
            status: 'consented' as const,
            reply: null,
          })),
          signOff: fromPromise(async () => 'bye'),
          declineConsent: fromPromise(async () => {}),
          askQuestion: fromPromise(async () => 'q'),
          evaluateReply: fromPromise(async () => answered('x')),
          saveAnswer: fromPromise(async () => {}),
          summarise: fromPromise(async () => 'summary'),
          completeOnboarding: fromPromise(async () => {}),
          deleteOnboarding: fromPromise(async () => {}),
        },
      }),
      { input: { ...INPUT, questions: ONE, answers: { q1: 'already done' } } },
    );
    resumed.start();
    await waitFor(resumed, (s) => s.matches('awaitingConsent'));
    resumed.send({ type: 'REPLY', text: 'yes' });
    await waitFor(resumed, (s) => s.matches('confirming'));
    expect(resumed.getSnapshot().matches('confirming')).toBe(true);
  });
});
```

The `OnboardingQuestions` type is needed in this block — add it to the existing `#/types` type import at the top of the file.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/machines/__tests__/onboarding-machine.test.ts`

Expected: FAIL — `FOLLOW_UP_CAP` is not exported and the question-loop states do not exist. The Task 5 consent tests will also fail, because the import at the top fails.

- [ ] **Step 3: Extend the machine**

In `src/machines/onboarding-machine.ts`:

Add to the imports:

```ts
import { pendingQuestions } from '#/lib/course-onboarding';
import type {
  OnboardingAnswers,
  OnboardingConsentEvaluation,
  OnboardingQuestions,
  OnboardingReplyEvaluation,
} from '#/types';
```

Add beside `CONSENT_CLARIFICATION_CAP`:

```ts
/**
 * How many follow-ups a single question gets before the reply is taken as the
 * answer. Without a cap, `needs_follow_up` loops forever on a user who keeps
 * answering vaguely, and the doc's 10-15 minute target is unenforceable.
 */
export const FOLLOW_UP_CAP = 2;

/**
 * Turn count standing in for the doc's ten-minute mark — roughly two turns per
 * question across a five-to-seven question set. Past it, the agent re-states
 * the stop/suspend/delete controls, at most once per question.
 */
export const HESITANCY_TURN_THRESHOLD = 12;
```

Add these actors to the `setup({ actors })` block:

```ts
    askQuestion: fromPromise<
      string,
      { context: OnboardingContext; questionId: string }
    >(async () => ''),
    evaluateReply: fromPromise<
      OnboardingReplyEvaluation,
      { context: OnboardingContext; questionId: string; reply: string }
    >(async () => ({
      status: 'needs_follow_up',
      answer: null,
      followUp: null,
      hesitancy: false,
    })),
    saveAnswer: fromPromise<
      void,
      { onboardingId: number; questionId: string; answer: string }
    >(async () => {}),
    summarise: fromPromise<string, { context: OnboardingContext }>(
      async () => '',
    ),
    completeOnboarding: fromPromise<void, { onboardingId: number }>(
      async () => {},
    ),
    deleteOnboarding: fromPromise<void, { onboardingId: number }>(
      async () => {},
    ),
```

Add this to the `setup({ ... })` object, after `actors`:

```ts
  actions: {
    /**
     * currentQuestionId is DERIVED, never independently tracked — it is always
     * the head of pendingQuestions(). That is what stops the machine drifting
     * from persisted state when a session resumes.
     */
    selectNextQuestion: assign({
      currentQuestionId: ({ context }) =>
        pendingQuestions(context.questions, context.answers)[0]?.id ?? null,
      followUpCount: 0,
    }),
  },
```

Replace the placeholder `asking: {}` state with:

```ts
    asking: {
      entry: 'selectNextQuestion',
      always: [
        {
          guard: ({ context }) => context.currentQuestionId === null,
          target: 'summarising',
        },
      ],
      invoke: {
        src: 'askQuestion',
        input: ({ context }) => ({
          context,
          questionId: context.currentQuestionId ?? '',
        }),
        onDone: { target: 'awaitingAnswer' },
        onError: { target: 'failed' },
      },
    },

    awaitingAnswer: {
      on: {
        REPLY: {
          target: 'evaluating',
          actions: assign({
            lastReply: ({ event }) => event.text,
            turnCount: ({ context }) => context.turnCount + 1,
          }),
        },
        PAUSE: { target: 'paused' },
        DELETE: { target: 'deleting' },
      },
    },

    evaluating: {
      invoke: {
        src: 'evaluateReply',
        input: ({ context }) => ({
          context,
          questionId: context.currentQuestionId ?? '',
          reply: context.lastReply ?? '',
        }),
        onDone: [
          { guard: ({ event }) => event.output.status === 'wants_pause', target: 'paused' },
          { guard: ({ event }) => event.output.status === 'wants_delete', target: 'deleting' },
          {
            guard: ({ context, event }) =>
              event.output.status === 'needs_follow_up' &&
              context.followUpCount < FOLLOW_UP_CAP,
            target: 'awaitingAnswer',
            actions: assign({
              followUpCount: ({ context }) => context.followUpCount + 1,
            }),
          },
          {
            // answered, declined, or follow-ups exhausted. A declined question
            // stores an empty string — a present key counts as answered, so it
            // never re-prompts.
            target: 'persisting',
            actions: assign({
              answers: ({ context, event }) => ({
                ...context.answers,
                [context.currentQuestionId ?? '']: event.output.answer ?? '',
              }),
            }),
          },
        ],
        onError: { target: 'failed' },
      },
    },

    persisting: {
      invoke: {
        src: 'saveAnswer',
        input: ({ context }) => ({
          onboardingId: context.onboardingId,
          questionId: context.currentQuestionId ?? '',
          answer: context.answers[context.currentQuestionId ?? ''] ?? '',
        }),
        onDone: { target: 'asking' },
        onError: { target: 'failed' },
      },
    },

    summarising: {
      invoke: {
        src: 'summarise',
        input: ({ context }) => ({ context }),
        onDone: { target: 'confirming' },
        onError: { target: 'failed' },
      },
    },

    confirming: {
      on: {
        REPLY: { target: 'summarising' },
        CONFIRM: { target: 'completing' },
        PAUSE: { target: 'paused' },
        DELETE: { target: 'deleting' },
      },
    },

    completing: {
      invoke: {
        src: 'completeOnboarding',
        input: ({ context }) => ({ onboardingId: context.onboardingId }),
        onDone: { target: 'complete' },
        onError: { target: 'failed' },
      },
    },

    deleting: {
      invoke: {
        src: 'deleteOnboarding',
        input: ({ context }) => ({ onboardingId: context.onboardingId }),
        onDone: { target: 'deleted' },
        onError: { target: 'failed' },
      },
    },
```

Add `complete: { type: 'final' }` beside the other final states, and change the `DELETE` handler in `awaitingConsent` from `target: 'deleted'` to `target: 'deleting'` so a delete during the consent gate also removes the row.

Add `CONFIRM` to `OnboardingEvent`:

```ts
export type OnboardingEvent =
  | { type: 'REPLY'; text: string }
  | { type: 'CONFIRM' }
  | { type: 'PAUSE' }
  | { type: 'DELETE' };
```

**Note the `confirming` state's `REPLY` vs `CONFIRM` split.** A plain reply there is treated as a correction and re-summarises; only an explicit `CONFIRM` completes. Both paths are covered — "re-summarises when the user corrects the summary" sends `REPLY`, "persists an answer and completes" sends `CONFIRM`.

**There is no `appendMessage` actor on the machine.** Transcript writes happen in the implementations layer (Task 10): the wrappers around `greet` / `askQuestion` / `signOff` / `summarise` append the assistant turn, and the wrappers around `evaluateConsent` / `evaluateReply` append the user turn they were given. Keeping it out of the machine means no extra states exist purely to persist, and the machine stays free of `@/db`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/machines/__tests__/onboarding-machine.test.ts`

Expected: PASS, 16 tests (6 consent + 10 question loop).

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`

Expected: 101 test files pass — baseline 95, plus step 1's two, plus this plan's `onboarding-evaluation-schemas`, `onboarding-default-questions`, `onboarding-session`, and `onboarding-machine`. Any failure elsewhere is a regression.

- [ ] **Step 6: Check formatting and types**

Run: `pnpm exec biome check src/machines/onboarding-machine.ts src/machines/__tests__/onboarding-machine.test.ts`
Run: `pnpm exec tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/machines/onboarding-machine.ts src/machines/__tests__/onboarding-machine.test.ts
git status --short
git commit -m "feat(onboarding): add question loop, follow-up cap, and completion"
```

---

## Task 7: Persona system prompt

**Files:**
- Create: `src/ai/prompts/onboarding.ts`
- Test: `src/ai/__tests__/onboarding-prompt.test.ts`

**Interfaces:**
- Consumes: `brand` from `#/ai/prompts/brand`; `OnboardingQuestions` from `#/types`.
- Produces: `onboardingSystemPrompt(args: { courseName: string; questions: OnboardingQuestions; remindControls: boolean }): string`

**Source of truth is `docs/onboarding.md`.** Transcribe its Purpose, Format, and Decision-flowchart sections into the prompt: one question at a time, adaptive follow-ups rather than a form read aloud, 10–15 minute target, warm and unhurried tone, and the three controls (stop and resume later, suspend, delete everything with no explanation needed). Read that file before writing this.

Follow the shape of `src/ai/prompts/viper7.ts`: an exported function taking an options object and returning a string.

- [ ] **Step 1: Write the failing test**

Create `src/ai/__tests__/onboarding-prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import type { OnboardingQuestions } from '#/types';

const QUESTIONS: OnboardingQuestions = [
  { id: 'q1', text: 'What is your background?' },
  { id: 'q2', text: 'Why this course?' },
];

const base = {
  courseName: 'Remote Pilot Theory',
  questions: QUESTIONS,
  remindControls: false,
};

describe('onboardingSystemPrompt', () => {
  it('names the course', () => {
    expect(onboardingSystemPrompt(base)).toContain('Remote Pilot Theory');
  });

  it('includes every question it must cover', () => {
    const prompt = onboardingSystemPrompt(base);
    expect(prompt).toContain('What is your background?');
    expect(prompt).toContain('Why this course?');
  });

  it('instructs one question at a time', () => {
    expect(onboardingSystemPrompt(base).toLowerCase()).toContain(
      'one question at a time',
    );
  });

  it('states the three user controls', () => {
    const prompt = onboardingSystemPrompt(base).toLowerCase();
    expect(prompt).toContain('resume');
    expect(prompt).toContain('delete');
  });

  it('adds a control reminder only when asked', () => {
    const without = onboardingSystemPrompt(base);
    const with_ = onboardingSystemPrompt({ ...base, remindControls: true });
    expect(with_.length).toBeGreaterThan(without.length);
  });

  it('handles an empty question set without throwing', () => {
    expect(() =>
      onboardingSystemPrompt({ ...base, questions: [] }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/ai/__tests__/onboarding-prompt.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the prompt module**

Read `docs/onboarding.md` first. Create `src/ai/prompts/onboarding.ts` exporting `onboardingSystemPrompt` with the signature above. It must:

- introduce the agent using `brand.ai.name` and `brand.name`, matching how `viper7.ts` uses `brand`
- state the purpose from the doc: tailoring pacing, depth, and examples — explicitly not evaluating or judging
- carry the Format rules verbatim in substance: conversational and adaptive, **one question at a time**, follow up naturally rather than marching through a list, 10–15 minutes, warm and unhurried
- list the questions to cover, numbered, with a note that the wording is a starting point to be rephrased naturally
- state the three controls: stop and pick up later, suspend and resume, stop and delete everything with no explanation needed
- when `remindControls` is true, append a short instruction to re-state those controls in this turn

Keep it a plain template string. No AI SDK imports — this module must stay importable under vitest.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/ai/__tests__/onboarding-prompt.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Check formatting and types**

Run: `pnpm exec biome check src/ai/prompts/onboarding.ts src/ai/__tests__/onboarding-prompt.test.ts`
Run: `pnpm exec tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/ai/prompts/onboarding.ts src/ai/__tests__/onboarding-prompt.test.ts
git status --short
git commit -m "feat(onboarding): add agent persona system prompt"
```

---

## Task 8: The AI actors

**Files:**
- Create: `src/ai/onboarding/greet.ts`, `evaluate-consent.ts`, `ask-question.ts`, `evaluate-reply.ts`, `summarise.ts`, `sign-off.ts`

**Interfaces:**
- Consumes: `onboardingSystemPrompt` (Task 7); `OnboardingConsentEvaluationSchema`, `OnboardingReplyEvaluationSchema` (Task 4); `OnboardingContext` (Task 5); `sonnet`, `geminiFlash` from `#/ai/ai-provider`.
- Produces six async functions, each matching the corresponding actor's input/output types in the machine's `setup({ actors })` block.

**No tests for these.** They are thin wrappers over `generateText` / `generateObject` whose only untested surface is a live model call, which the suite must not make. Their contracts are already enforced two ways: the zod schemas (Task 4, tested) and the machine's actor types (Task 5/6, tested with stubs). Do not add tests that assert a mocked SDK returns what you told it to return — that asserts nothing.

Model choice per the spec: `sonnet` for `evaluateConsent`, `evaluateReply`, and `summarise` (all judgment); `geminiFlash` for `greet`, `askQuestion`, and `signOff` (phrasing).

Follow `src/ai/evaluate-answer.ts` for the `generateObject` call shape and `src/ai/chat.ts` for how models are referenced.

**Write exactly these six signatures.** Task 10 wires them mechanically, so the names and argument shapes are fixed:

```ts
// greet.ts
export const greet: (a: { context: OnboardingContext; courseName: string }) => Promise<string>;

// ask-question.ts
export const askQuestion: (a: {
  context: OnboardingContext;
  courseName: string;
  questionId: string;
}) => Promise<string>;

// sign-off.ts
export const signOff: (a: { context: OnboardingContext; courseName: string }) => Promise<string>;

// summarise.ts
export const summarise: (a: { context: OnboardingContext; courseName: string }) => Promise<string>;

// evaluate-consent.ts
export const evaluateConsent: (a: {
  context: OnboardingContext;
  courseName: string;
  reply: string;
}) => Promise<OnboardingConsentEvaluation>;

// evaluate-reply.ts
export const evaluateReply: (a: {
  context: OnboardingContext;
  courseName: string;
  questionId: string;
  reply: string;
}) => Promise<OnboardingReplyEvaluation>;
```

`courseName` is threaded through as an argument rather than read from context, because the machine's context carries `courseId`, not the name.

- [ ] **Step 1: Write the three `generateText` actors**

Create `src/ai/onboarding/greet.ts`, `src/ai/onboarding/ask-question.ts`, and `src/ai/onboarding/sign-off.ts`. Each:

- takes the input type declared in the machine's `setup({ actors })` block
- builds its system prompt with `onboardingSystemPrompt({ courseName, questions, remindControls })`, deriving `remindControls` from `context.turnCount >= HESITANCY_TURN_THRESHOLD`
- calls `generateText({ model: geminiFlash, system, prompt })`
- returns `text`

`greet` produces the warm open plus consent framing. `askQuestion` produces the current question, phrased naturally given the conversation so far. `signOff` produces a brief, warm acknowledgement of a declined consent — no re-pitching, no asking why.

- [ ] **Step 2: Write the two `generateObject` actors**

Create `src/ai/onboarding/evaluate-consent.ts` and `src/ai/onboarding/evaluate-reply.ts`. Each calls:

```ts
const { object } = await generateObject({
  model: sonnet,
  schema: OnboardingConsentEvaluationSchema, // or OnboardingReplyEvaluationSchema
  system,
  prompt,
});
return object;
```

`evaluateConsent` decides whether the user agreed to proceed. Its prompt must state that anything short of a clear yes is `needs_clarification` or `declined` — never `consented`. `evaluateReply` decides what the reply means for the current question, and must set `hesitancy` when the user seems reluctant or is slow to engage, per the doc's rule about repeating the control options.

- [ ] **Step 3: Write the summariser**

Create `src/ai/onboarding/summarise.ts`: `generateText` with `sonnet`, given the answers map and the questions, producing the doc's closing reflect-back — a short summary of what was understood, an invitation to correct it, thanks, and what happens next.

- [ ] **Step 4: Verify types compile**

Run: `pnpm exec tsc --noEmit`

Expected: zero output. This is the real check for this task — each function must structurally match the actor type the machine declares, and `tsc` is what proves it.

- [ ] **Step 5: Check formatting**

Run: `pnpm exec biome check src/ai/onboarding/`

- [ ] **Step 6: Commit**

```bash
git add src/ai/onboarding/
git status --short
git commit -m "feat(onboarding): add agent actor implementations"
```

---

## Task 9: Persistence

**Files:**
- Create: `src/db/course-onboarding.ts`

**Interfaces:**
- Consumes: `db` from `@/db`; `courseOnboardingTable`, `courseOnboardingMessagesTable`, `coursesTable` from `@/db/schema`; `resolveQuestionSet` from `#/lib/onboarding-session`; `hashQuestionSet` from `#/lib/course-onboarding`.
- Produces: `loadOnboardingSession`, `saveAnswer`, `appendMessage`, `completeOnboarding`, `declineConsent`, `deleteOnboarding`.

**This module uses `@/` imports** (matching `src/db/course-progress.ts`) and is therefore not test-importable. No unit tests; `tsc` is the verification. Pure logic it needs lives in `src/lib/` and is already tested.

**Every write must set `updatedAt` explicitly.** No table in this schema uses `$onUpdate` — `src/db/admin.ts:743` sets it by hand. An upsert that omits it leaves the row at its insert-time value, silently breaking any "stale response" admin view built on `questionSetHash`.

**Write exactly these six signatures.** Task 10 wires them mechanically:

```ts
export const loadOnboardingSession: (a: { userId: string; courseId: number }) => Promise<{
  row: CourseOnboardingSelect;
  messages: CourseOnboardingMessagesSelect[];
  questions: OnboardingQuestions;
  source: OnboardingQuestionSource;
}>;

export const saveAnswer: (a: {
  onboardingId: number;
  questionId: string;
  answer: string;
  questions: OnboardingQuestions;
}) => Promise<void>;

export const appendMessage: (a: {
  onboardingId: number;
  role: 'assistant' | 'user';
  text: string;
  order: number;
}) => Promise<void>;

export const completeOnboarding: (a: { onboardingId: number }) => Promise<void>;
export const declineConsent: (a: { onboardingId: number }) => Promise<void>;
export const deleteOnboarding: (a: { onboardingId: number }) => Promise<void>;
```

- [ ] **Step 1: Write the module**

Create `src/db/course-onboarding.ts` with:

- `loadOnboardingSession({ userId, courseId })` — reads the course's `onboardingQuestions`, finds or creates the `course_onboarding` row, resolves the question set with `resolveQuestionSet(courseQuestions, row.questionSource)`, freezes `questionSource` on creation, and returns the row, its messages ordered by `order`, and the resolved `{ questions, source }`.
- `saveAnswer({ onboardingId, questionId, answer, questions })` — merges the answer into the jsonb map, restamps `questionSetHash` with `hashQuestionSet(questions)`, and sets `updatedAt`. Use a single `UPDATE` with a jsonb merge (`sql\`answers || ${...}\``) rather than read-modify-write, so two concurrent tabs cannot clobber each other's answers.
- `appendMessage({ onboardingId, role, text, order })` — inserts one turn with `parts` shaped as `[{ type: 'text', text }]`, matching `aiMessages`. Use `.onConflictDoNothing()` on the `(onboarding_id, order)` unique index so a retried request is idempotent.
- `completeOnboarding({ onboardingId })` — sets `onboardingCompletedAt` and `updatedAt`.
- `declineConsent({ onboardingId })` — sets `consentDeclinedAt` and `updatedAt`.
- `deleteOnboarding({ onboardingId })` — deletes the row; messages cascade.

- [ ] **Step 2: Verify types compile**

Run: `pnpm exec tsc --noEmit`

Expected: zero output.

- [ ] **Step 3: Check formatting**

Run: `pnpm exec biome check src/db/course-onboarding.ts`

Note this is a new file, so single quotes — unlike `src/db/schema.ts`. Follow whatever `src/db/course-progress.ts` does if biome disagrees with you.

- [ ] **Step 4: Commit**

```bash
git add src/db/course-onboarding.ts
git status --short
git commit -m "feat(onboarding): add onboarding persistence layer"
```

---

## Task 10: Wire it together

**Files:**
- Create: `src/machines/onboarding-implementations.ts`

**Interfaces:**
- Consumes: everything from Tasks 5, 6, 8, 9.
- Produces: `createOnboardingImplementations(deps): { actors: {...} }` suitable for `onboardingMachine.provide(...)`.

Mirrors `createAuthLoginImplementations` in `src/machines/auth-login-machine.ts`: a factory taking injected dependencies and returning the implementations object. This is the seam that keeps the machine testable — and the one place that would change if `@statelyai/agent` is adopted later.

**No test.** It is pure wiring: every actor it returns is already covered, either by the machine's stub-driven transition tests or by `tsc` structurally matching the actor types.

- [ ] **Step 1: Write the factory**

Create `src/machines/onboarding-implementations.ts`:

```ts
import { fromPromise } from 'xstate';
import { askQuestion } from '#/ai/onboarding/ask-question';
import { evaluateConsent } from '#/ai/onboarding/evaluate-consent';
import { evaluateReply } from '#/ai/onboarding/evaluate-reply';
import { greet } from '#/ai/onboarding/greet';
import { signOff } from '#/ai/onboarding/sign-off';
import { summarise } from '#/ai/onboarding/summarise';
import {
  appendMessage,
  completeOnboarding,
  declineConsent,
  deleteOnboarding,
  saveAnswer,
} from '@/db/course-onboarding';

export type OnboardingDeps = {
  /** The machine's context carries courseId, not the name. */
  courseName: string;
  /** Turns already persisted for this session; the next turn's order. */
  initialMessageCount: number;
};

/**
 * Wires the real actors and persistence into the machine.
 *
 * Transcript writes live here rather than in the machine: each text-producing
 * actor appends its own assistant turn, and each evaluator appends the user
 * turn it was handed. That keeps the machine free of @/db and avoids states
 * that exist only to persist.
 *
 * This module imports @/db, so it is not test-importable — which is exactly
 * why the machine does not import it.
 */
export const createOnboardingImplementations = (deps: OnboardingDeps) => {
  let order = deps.initialMessageCount;
  const nextOrder = () => order++;

  const say = async (
    onboardingId: number,
    text: string,
  ): Promise<string> => {
    await appendMessage({
      onboardingId,
      role: 'assistant',
      text,
      order: nextOrder(),
    });
    return text;
  };

  const heard = async (onboardingId: number, text: string): Promise<void> => {
    await appendMessage({
      onboardingId,
      role: 'user',
      text,
      order: nextOrder(),
    });
  };

  return {
    actors: {
      greet: fromPromise(async ({ input }) =>
        say(
          input.context.onboardingId,
          await greet({ context: input.context, courseName: deps.courseName }),
        ),
      ),

      askQuestion: fromPromise(async ({ input }) =>
        say(
          input.context.onboardingId,
          await askQuestion({
            context: input.context,
            courseName: deps.courseName,
            questionId: input.questionId,
          }),
        ),
      ),

      signOff: fromPromise(async ({ input }) =>
        say(
          input.context.onboardingId,
          await signOff({ context: input.context, courseName: deps.courseName }),
        ),
      ),

      summarise: fromPromise(async ({ input }) =>
        say(
          input.context.onboardingId,
          await summarise({
            context: input.context,
            courseName: deps.courseName,
          }),
        ),
      ),

      evaluateConsent: fromPromise(async ({ input }) => {
        await heard(input.context.onboardingId, input.reply);
        return evaluateConsent({
          context: input.context,
          courseName: deps.courseName,
          reply: input.reply,
        });
      }),

      evaluateReply: fromPromise(async ({ input }) => {
        await heard(input.context.onboardingId, input.reply);
        return evaluateReply({
          context: input.context,
          courseName: deps.courseName,
          questionId: input.questionId,
          reply: input.reply,
        });
      }),

      saveAnswer: fromPromise(async ({ input }) => {
        await saveAnswer({
          onboardingId: input.onboardingId,
          questionId: input.questionId,
          answer: input.answer,
          questions: deps.questions,
        });
      }),

      completeOnboarding: fromPromise(async ({ input }) => {
        await completeOnboarding({ onboardingId: input.onboardingId });
      }),

      declineConsent: fromPromise(async ({ input }) => {
        await declineConsent({ onboardingId: input.onboardingId });
      }),

      deleteOnboarding: fromPromise(async ({ input }) => {
        await deleteOnboarding({ onboardingId: input.onboardingId });
      }),
    },
  };
};
```

Note `saveAnswer` needs the question set to restamp `questionSetHash`, so add `questions: OnboardingQuestions` to `OnboardingDeps` alongside `courseName` and `initialMessageCount`, importing the type from `#/types`.

`order` is a closure counter seeded from `initialMessageCount` (the count returned by `loadOnboardingSession`), so a resumed session continues numbering rather than colliding with existing turns. The unique `(onboarding_id, order)` index plus `onConflictDoNothing` is the backstop if it ever does.

- [ ] **Step 2: Verify types compile**

Run: `pnpm exec tsc --noEmit`

Expected: zero output. `tsc` is what proves each wrapper matches the machine's declared actor type.

- [ ] **Step 3: Run the full suite**

Run: `pnpm test`

Expected: 102 test files pass (101 from Task 6, plus Task 7's prompt test). No regressions.

- [ ] **Step 4: Check formatting**

Run: `pnpm exec biome check src/machines/onboarding-implementations.ts`

- [ ] **Step 5: Commit**

```bash
git add src/machines/onboarding-implementations.ts
git status --short
git commit -m "feat(onboarding): wire actors and persistence into the machine"
```

- [ ] **Step 6: Ask the user to apply the schema**

Do not run this yourself. Post to the user:

> Backend is complete. Please run `pnpm db:push` to apply the two new columns and the `course_onboarding_messages` table, then confirm.

Once confirmed, verify: `question_source varchar(16)` and `consent_declined_at timestamp` are nullable on `course_onboarding`; `course_onboarding_messages` exists with a unique index on `(onboarding_id, order)` and a CASCADE foreign key to `course_onboarding`.

---

## Done criteria

- `pnpm test` passes with no regressions against the 97-file / 520-test baseline.
- `pnpm exec tsc --noEmit` reports zero output.
- The consent invariant holds under test: on every declined path, no question is asked and `answers` stays empty.
- `course_onboarding_messages` exists in the database with its unique index and cascading foreign key.
- No new entries in `package.json` dependencies.

## Explicitly out of scope

- Any UI, and any route that renders one.
- An API route or server function exposing the machine — that arrives with the UI wiring.
- Streaming responses. `generateText` / `generateObject` are used throughout; `streamText` slots in at the transport layer later.
- Admin views over transcripts.
- Gating course access on onboarding completion.
