# Onboarding Agent — Conversational Intake

**Date:** 2026-07-28
**Status:** Approved, ready for planning
**Scope:** Step 2 of the course onboarding feature — backend only. No UI.
**Builds on:** `docs/superpowers/specs/2026-07-28-course-onboarding-design.md`

## Context

Step 1 added the `course_onboarding` table (one row per user per course, an
`answers` map keyed by question id, a `questionSetHash`, and a nullable
`onboardingCompletedAt`), plus pure helpers in `src/lib/course-onboarding.ts`:
`hashQuestionSet`, `pendingQuestions`, `isOnboardingComplete`.

This step builds the agent that fills that `answers` map by conducting a
conversation — one question at a time, adaptive, warm — rather than rendering a
form.

`docs/onboarding.md` is the source of the agent's character, behaviour, and
tone. It is not a question list; it is the persona.

## Non-goals

- Any UI. No components, no routes that render. Wiring comes later.
- Streaming responses (see Transport).
- Admin views over transcripts.
- Gating course access on onboarding completion.
- Changing the admin question editor.

## Key decision: no `@statelyai/agent`

The obvious package for this — `@statelyai/agent` — cannot be used here. The
documented API (`setupAgent`, `defineModels`, `createTextLogic`,
`agent.decide`) exists only in `2.0.0-alpha.11`, whose peer dependencies are:

| Peer | Required | This repo has |
|---|---|---|
| `ai` | `^6.0.67` | `6.0.168` ✓ |
| `zod` | `^3.25 \|\| ^4` | `4.3.6` ✓ |
| `xstate` | `>=6.0.0-alpha.16 <6.0.0` | `5.32.4` ✗ |

XState 6 is alpha-only (stable is 5.32.5), and adopting it would also force
`@xstate/react` from `6.1.0` to `7.0.0-alpha.1`, since `6.1.0` peers
`xstate ^5.28.0`. That is three pre-release packages, two of them underneath
`src/machines/auth-login-machine.ts` and `src/components/auth/auth-flow-container.tsx`
— shipped auth code.

The npm `latest` tag, `1.1.6`, is from September 2024, has a different API
(`createAgent` / `fromDecision`), and depends on `ai@^3.4.6` — three majors
behind this repo.

**Decision:** build on plain XState 5 (already a dependency) driving the AI SDK
already in use. No new dependencies. The orchestration the package would have
provided is roughly one machine file. Because this step is backend-only and the
machine's actors are injected rather than imported, swapping in the agent
package later — once XState 6 is stable — is a contained change.

## Question source

The **effective question set** for a row is:

```
course.onboardingQuestions.length > 0
  ? course.onboardingQuestions      // source: 'admin'
  : DEFAULT_ONBOARDING_QUESTIONS    // source: 'default'
```

A fallback, not a merge. It is resolved once when the row is created and
**frozen** in the new `questionSource` column.

**Why frozen:** without it, an admin adding the first question to a course flips
the effective set. Every default answer becomes an orphan, every admin question
becomes pending, and users who had completed onboarding read as incomplete and
are re-interviewed from scratch. Freezing the source means a user who onboarded
on defaults keeps being evaluated against defaults; only users starting fresh
after the change get the admin set.

Everything from step 1 operates on the effective set unchanged — `pendingQuestions`,
`isOnboardingComplete`, and `hashQuestionSet` are indifferent to its origin.

### Default question set

`src/lib/onboarding-default-questions.ts` exports `DEFAULT_ONBOARDING_QUESTIONS`
as an `OnboardingQuestions` array derived from the structure in
`docs/onboarding.md` §Structure, with **stable, reserved ids**:

| id | covers |
|---|---|
| `core:background` | work experience, education, qualifications |
| `core:motivation` | motivation and goals for taking the course |
| `core:learning-style` | pacing preferences, repetition, depth |
| `core:schedule` | frequency, time of day, logistics |
| `core:exam` | expectations about the final interview / exam |

Ids must never change once shipped — they are persisted answer keys. They are
namespaced `core:` so they cannot collide with admin question ids, which are
`crypto.randomUUID()` (see `src/components/admin/onboarding-helpers.ts`).

The doc's §1 (warm open + consent framing) and §7 (closing summary) are not
questions — they are machine states, covered below.

## Schema changes

Both additive. Applied with `pnpm db:push` (this repo's convention).

### `course_onboarding` — two new columns

```ts
// 'admin' | 'default' — the question source frozen at row creation, so an
// admin adding questions later cannot re-interview users who answered the
// built-in defaults.
questionSource: varchar("question_source", { length: 16 }),

// Set when the user declines the consent framing. The row persists with an
// empty answers map so onboarding is never auto-offered again — declining is
// respected, not re-pitched on the next visit.
consentDeclinedAt: timestamp("consent_declined_at", { mode: "date" }),
```

`questionSource` is nullable because rows created by step 1 predate it. A null
is read as `'admin'` when the course has questions and `'default'` when it does
not — i.e. the pre-freeze behaviour, which is correct for rows that have no
answers yet.

`consentDeclinedAt` is nullable and null for every existing row.

### Whether to offer onboarding

A new pure helper in `src/lib/course-onboarding.ts`, beside step 1's:

```ts
/**
 * Whether onboarding should be offered to this user for this course.
 *
 * A declined consent is a decision, not a pending task: it suppresses the
 * offer permanently. The user can still start onboarding themselves — this
 * governs only whether we bring it up.
 */
export const shouldOfferOnboarding = (
  row: { onboardingCompletedAt: Date | null; consentDeclinedAt: Date | null } | null,
): boolean =>
  row == null ||
  (row.onboardingCompletedAt == null && row.consentDeclinedAt == null);
```

Note this is deliberately **not** folded into `isOnboardingComplete`. A user who
declined consent is not complete — they opted out. Conflating the two would
make an opt-out indistinguishable from a finished interview in any admin view.

### `course_onboarding_messages` — new table

```ts
export const courseOnboardingMessagesTable = pgTable(
  "course_onboarding_messages",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    onboardingId: integer("onboarding_id")
      .notNull()
      .references(() => courseOnboardingTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull(), // 'assistant' | 'user'
    parts: jsonb("parts").notNull(),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("course_onboarding_messages_onboarding_order_idx").on(
      table.onboardingId,
      table.order,
    ),
    index("course_onboarding_messages_onboarding_id_idx").on(table.onboardingId),
  ],
);
```

**Why a dedicated table** rather than reusing `aiChats` / `aiMessages`: the
cascade from `course_onboarding` makes *"delete everything shared, no
explanation needed"* a single row delete, and it keeps intake dialogue out of
the user's general chat history. `aiChats` also has no `courseId`.

**Why unique `(onboardingId, order)`**: a retried request must not append the
same turn twice. Same reasoning as the unique index on the parent row.

**Why `parts` as jsonb**: mirrors `aiMessages.parts`, so the rows are
compatible with the AI SDK `UIMessage` shape when the UI is wired.

## The machine

`src/lib/onboarding-machine.ts`, using XState 5's `setup()`.

**Actors are injected, not imported.** The machine file imports nothing from
`ai` and nothing from `@/db`. This follows the convention `src/ai/chat.ts`
already documents in a comment: pure logic lives in `src/lib/` so vitest can
import it without pulling in `@/db` transitively. Tests supply stub actors; the
server supplies real ones.

### States

```
loading
  └→ greeting              warm open + consent/control framing
       └→ awaitingConsent
            └→ evaluatingConsent
                 ├→ greeting          (needs_clarification, under cap)
                 ├→ asking            (consented)
                 └→ signingOff        (declined)
                      └→ consentDeclined      terminal

  asking                   emit the question for currentQuestionId
    └→ awaitingAnswer
         └→ evaluating
              ├→ asking               (needs_follow_up, under cap)
              ├→ persisting           (answered | declined)
              ├→ paused
              └→ deleted

  persisting
    ├→ asking              (pending questions remain)
    └→ summarising         (nothing pending)
         └→ confirming
              ├→ summarising          (user corrects)
              └→ complete
```

`paused` and `deleted` are reachable from any waiting state — the doc promises
those controls are available *at any point*.

### The consent gate

No question is asked until the user agrees to proceed. `signingOff` generates a
warm, brief acknowledgement — no re-pitching, no asking why — appends it as the
final assistant turn, stamps `consentDeclinedAt`, and ends.

`evaluatingConsent` is a separate actor from `evaluateReply`, not an extra
status on it. The judgment is materially different — "did they agree to
proceed" versus "does this reply answer the question" — and merging them would
mean one prompt doing two unrelated jobs.

```ts
export const OnboardingConsentEvaluationSchema = z.object({
  status: z.enum(['consented', 'declined', 'needs_clarification']),
  reply: z.string().max(2000).nullable(),
});
```

`needs_clarification` covers the user who responds with a question rather than
a yes or no ("what do you do with this?"). It loops back to `greeting` to
answer them, capped at 2 clarifications.

**On reaching the cap, or on an ambiguous reply, the machine treats it as
`declined`.** Consent must be affirmative — proceeding to collect background,
schedule, and career information on an unclear signal is the wrong default.

### Context

```ts
{
  onboardingId: number;
  courseId: number;
  userId: string;
  questions: OnboardingQuestions;   // the effective set
  source: 'admin' | 'default';
  answers: OnboardingAnswers;
  currentQuestionId: string | null;
  followUpCount: number;
  consentClarificationCount: number;
  turnCount: number;
  messages: OnboardingMessage[];
}
```

`currentQuestionId` is derived from `pendingQuestions(questions, answers)[0]` —
the machine does not maintain its own ordering. This keeps step 1's helper as
the single source of truth for what is outstanding.

### Actors

| Actor | AI SDK call | Returns |
|---|---|---|
| `greet` | `generateText` | the warm open + consent/control framing |
| `evaluateConsent` | `generateObject` + zod | `OnboardingConsentEvaluationSchema` |
| `askQuestion` | `generateText` | the question, phrased naturally given history |
| `evaluateReply` | `generateObject` + zod | the structured decision below |
| `summarise` | `generateText` | the closing reflect-back |
| `signOff` | `generateText` | the polite acknowledgement on declined consent |

```ts
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
```

`status` is the pivot that turns a free-text reply into a state transition.

`hesitancy` implements the doc's rule: *"Repeat this option briefly if the
conversation runs more than 10 minutes or touches something the trainee seems
hesitant about."* When `hesitancy` is true, or `turnCount` reaches 12 (a proxy
for the doc's ten-minute mark — roughly two turns per question across a
five-to-seven question set), the next assistant turn re-states the
stop/suspend/delete controls. The controls are re-stated at most once per
question, so a hesitant user is not told the same thing every turn.

### Declined questions

`declined` persists an **empty-string answer**, not a skipped key. This is
exactly why step 1 made a present key count as answered even when empty: a
question the user declined must not re-prompt forever. It also means
`isOnboardingComplete` can go true with declined answers in the map, which is
correct — the user finished, they just chose not to answer everything.

### Follow-up cap

`followUpCount` is capped per question (2 follow-ups, then the reply is taken
as the answer). Without a cap, `needs_follow_up` can loop indefinitely on a
user who keeps giving vague answers, and the doc's 10–15 minute target is
unenforceable.

## Persistence

`src/db/course-onboarding.ts`:

- `loadOnboardingSession(userId, courseId)` — the row, its messages, and the
  course's questions in one call; creates the row (resolving and freezing
  `questionSource`) if absent.
- `saveAnswer(onboardingId, questionId, answer, questionSetHash)` — upserts the
  answer into the map and restamps the hash.
- `appendMessage(onboardingId, role, parts, order)` — one turn.
- `completeOnboarding(onboardingId)` — stamps `onboardingCompletedAt`.
- `declineConsent(onboardingId)` — stamps `consentDeclinedAt`. The row and its
  greeting/sign-off turns are kept; the answers map stays empty.
- `deleteOnboarding(onboardingId)` — deletes the row; the transcript goes with
  it by cascade.

**Every write must set `updatedAt` explicitly.** No table in this schema uses
`$onUpdate` — `src/db/admin.ts` sets it by hand — so an upsert that omits it
leaves every row at its insert-time value, which would silently break any
"stale response" admin view built on `questionSetHash`.

## Transport

Non-streaming for this step. The machine needs a complete assistant turn before
it can decide a transition, so `streamText` buys nothing until a UI exists.
`generateText` and `generateObject` match how `src/ai/evaluate-answer.ts`
already calls the SDK.

Models come from `src/ai/ai-provider.ts` (gateway-routed string ids). Use
`sonnet` for `evaluateReply` and `summarise` — both need judgment — and
`geminiFlash` for `askQuestion`, which is phrasing.

## Files

| File | Responsibility |
|---|---|
| `src/lib/onboarding-machine.ts` | the machine; actors injected; no `ai`/`db` imports |
| `src/lib/onboarding-default-questions.ts` | `DEFAULT_ONBOARDING_QUESTIONS` with `core:*` ids |
| `src/lib/onboarding-session.ts` | pure resolution of the effective question set + source |
| `src/ai/prompts/onboarding.ts` | persona/system prompt built from `docs/onboarding.md` |
| `src/ai/onboarding/greet.ts` | `generateText` actor — open + consent framing |
| `src/ai/onboarding/evaluate-consent.ts` | `generateObject` actor |
| `src/ai/onboarding/ask-question.ts` | `generateText` actor |
| `src/ai/onboarding/evaluate-reply.ts` | `generateObject` actor |
| `src/ai/onboarding/summarise.ts` | `generateText` actor |
| `src/ai/onboarding/sign-off.ts` | `generateText` actor — declined-consent close |
| `src/db/course-onboarding.ts` | the persistence functions above |
| `src/db/schema.ts` | the column + table above |

## Verification

- Machine transition tests with stubbed actors: the happy path, follow-up
  under and over the cap, `declined`, `wants_pause`, `wants_delete`, correction
  from `confirming`, and completion.
- Consent gate tests: `consented` proceeds to `asking`; `declined` reaches
  `consentDeclined` via `signingOff` and stamps `consentDeclinedAt`;
  `needs_clarification` loops to `greeting` under the cap and is treated as
  `declined` at the cap. Assert that **no question is ever asked and `answers`
  stays empty** on every declined path — that is the property the gate exists
  to guarantee.
- `shouldOfferOnboarding`: true for a null row and for an untouched row; false
  once `onboardingCompletedAt` is set; false once `consentDeclinedAt` is set;
  false when both are set.
- `DEFAULT_ONBOARDING_QUESTIONS` passes `OnboardingQuestionsSchema`; ids are
  `core:`-namespaced and unique.
- Effective-set resolution: admin questions win when present; defaults when the
  list is empty; source frozen thereafter.
- `OnboardingReplyEvaluationSchema` accepts each status and rejects unknown ones.
- No live model calls anywhere in the suite.
- `pnpm db:push` applies cleanly; the cascade from `course_onboarding` removes
  messages.

## Known limitations

**The 10–15 minute target is not directly enforceable.** The machine bounds
length structurally — a follow-up cap per question and a bounded question set —
and surfaces `turnCount` to the summariser so it can wrap up. It cannot
guarantee a duration, because the user controls how long they take to reply.

**Question wording drift still applies.** Step 1's limitation carries forward
unchanged: a row-level `questionSetHash` cannot express per-question freshness,
so an admin rewriting a question's text will not re-prompt a user who already
answered it.

**A summary correction reaches the summariser but never reaches the `answers`
map or the database.** `pendingCorrection` shapes the next reflect-back only —
it is read by `summarise` and then cleared; nothing writes it, or anything
derived from it, back into `context.answers` or persists it via `saveAnswer`.
Two consequences follow directly. First, a second correction reverts the
first: each re-summary is rebuilt from the untouched `answers` map plus
whichever single correction is currently pending, so a trainee who corrects
twice loses the effect of the first correction the moment the second one is
folded in. Second, a trainee who gives up mid-correction and just confirms
stamps a row via `completeOnboarding` whose `answers` were never actually
corrected — the summary they read and confirmed no longer matches what is
stored. The correction loop is also the only uncapped model-invoking loop in
the machine: `confirming` → `summarising` → `confirming` has no equivalent of
`FOLLOW_UP_CAP` or `CONSENT_CLARIFICATION_CAP`, so a trainee who keeps
correcting keeps re-invoking `summarise` indefinitely.

Fixing this properly needs an evaluator that maps a free-text correction back
onto the specific question id(s) it corrects — the same kind of judgment call
`evaluateReply` makes for an original answer, but running in reverse against
already-stored answers. That is deliberately deferred to the step that adds
the API route and UI, rather than bolted on here without a caller to exercise
it. Until then, `docs/onboarding.md`'s promise that the closing summary
"confirms accuracy" is only partially met: the trainee can react to the
summary and see their words reflected in the *next* summary, but a correction
is never durably applied to what actually gets saved.
