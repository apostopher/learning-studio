# Shared understanding: SKA profile

## Goal

Distil a completed course onboarding (`course_onboarding.answers` + the full
`course_onboarding_messages` transcript) into a per-user, per-course SKA
profile — Skills, Knowledge, Attitude. The user reviews and may edit it at the
end of onboarding. Once reviewed, it is injected into viper7's system prompt so
chat is personalised to that learner.

Not a silent inference: the profile is an AI judgement about a person, so it is
shown to them, editable by them, and inert until they have affirmed it.

## Decisions

| #   | Decision                            | Chosen                                                                                                                                                 | Rationale                                                                                                                                                                              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | User-visible?                       | Yes — shown at the end of onboarding, editable and saveable by the user                                                                                | An AI character judgement that silently steers every future conversation reads badly the day someone finds out. Cheap now, expensive to retrofit.                                       |
| 2   | Relationship to the existing close  | Keep the prose reflect-back exactly as-is; add a new `profiling` state **after** `CONFIRM` that renders an editable card in chat                        | The two artifacts have different voices and different readers. The reflect-back is viper7 talking to a person; the SKA profile is a dossier read by a machine. Merging degrades both. Also zero changes to the correction loop, the most intricate part of the machine. |
| 3   | Generator input                     | Full transcript **read from the DB** + the structured `answers` map, with declines explicitly marked                                                    | Skills/Knowledge are extractable from the answers; **Attitude is not** — it lives in *how* they answered. `context.transcript` is capped at `TRANSCRIPT_TURN_LIMIT` (20), which truncates exactly the opening turns where background and motivation live. |
| 4   | Storage shape                       | Three nullable text columns — `skills`, `knowledge`, `attitude` — with a `toSkaMarkdown()` helper deriving the markdown at read time                    | The three-heading structure is a contract the prompt depends on. As a free-text blob, a deleted heading or an `#` instead of `##` silently breaks it and every reader needs a parser. As columns, a missing section is unrepresentable. The section list is fixed by definition, so a blob's flexibility has no use case. |
| 5   | Per-section length cap              | ~2000 chars per section, enforced on save                                                                                                              | Edited text ships in the system prompt on **every chat turn, forever**. Unbounded, that is the silent cost failure with no ceiling.                                                     |
| 6   | Injection with a course in context  | All three sections                                                                                                                                     | —                                                                                                                                                                                       |
| 7   | Injection with **no** course        | `attitude` only                                                                                                                                        | Attitude is person-level in spirit and usually consistent across courses; Skills/Knowledge are course-specific and would cross-contaminate.                                             |
| 8   | Which attitude, when several exist  | The **most-recently-updated** reviewed profile's `attitude`. **No propagation** between courses.                                                        | Edits bump `updated_at`, so a hand-edited attitude automatically wins — correct precedence. Propagation would let finishing Course B silently rewrite the profile viper7 has used in Course A for months, with no notification and no undo. |
| 9   | Generation failure                  | Retry once, then **complete onboarding anyway** with no profile row                                                                                    | The profile is derived; the answers and transcript are already durable. Rolling back a completed interview to protect a reproducible artifact destroys the irreplaceable thing to save the cheap one. The user cannot fix a 503 by re-interviewing. |
| 10  | "No profile" as a state             | Permanently legitimate — never an error anywhere downstream                                                                                            | Same code path serves generation failure, thin interviews, and pre-launch users. One path, not three.                                                                                    |
| 11  | Fabrication guard                   | Leave a section **empty** rather than infer. No numeric floor on transcript length.                                                                     | A floor needs a magic number that will be wrong for someone and fails silently. The real danger is a plausible fabricated Attitude that a tired user rubber-stamps at minute 15. Empty beats confident-and-wrong, and only an explicit instruction gets you empty. |
| 12  | Withdrawal (`deleteOnboarding`)     | **Delete the profile row**, inside that function's existing transaction                                                                                | The profile is a third copy of the same disclosures, in the most sensitive form yet. `deleteOnboarding` already clears `machineSnapshot` for exactly this reason. Leaving the profile means viper7 keeps personalising from erased material — the worst plausible headline here. |
| 13  | Full delete vs tombstone            | Full row delete                                                                                                                                        | Safe *because* `course_onboarding.deletedAt` already prevents re-offering onboarding, so nothing can regenerate it. The tombstone's job is done one table over.                          |
| 14  | Consent declined                    | Never generated                                                                                                                                        | —                                                                                                                                                                                       |
| 15  | Foreign keys                        | `user_profile.user_id` and `courses.id`, both `onDelete: 'cascade'`                                                                                     | Mirrors `course_onboarding`; account and course deletion take the profile with them.                                                                                                    |
| 16  | Regeneration                        | **Never.** Created once at `profiling`; thereafter only the user's edits change it. No backfill, no auto-refresh, no regeneration on question-set change. | Every automatic regeneration path silently overwrites the user's hand-edits — the one part of this they own. A single write site means their edit is always the last word.               |
| 17  | Backfill of existing onboardings    | None — not launched yet                                                                                                                                 | —                                                                                                                                                                                       |
| 18  | When persisted                      | **At generation**, before the card renders; `completing` fires immediately and does not wait for the card                                               | Completion never hinges on the profile (see #9). Persisting early means an abandoned card loses nothing — the artifact survives and stays editable later.                               |
| 19  | When **used**                       | Only when `reviewedAt` is set. Unreviewed profiles are stored but never injected.                                                                       | An AI's character judgement steers nothing until the person has affirmed it.                                                                                                            |
| 20  | What sets `reviewedAt`              | One primary button on the card — "Looks right, save" — whether or not anything was edited. Closing without pressing leaves it unreviewed.                | If only an *edit* counted, the user who reads it, agrees, and closes would be permanently unpersonalised — and agreement is the success case. Tying it to a press rather than to render keeps the consent meaningful. |
| 21  | Post-onboarding edit surface        | **Required**, not optional: the same three fields on the course page, with a "not in use yet — review to activate" state and the same button             | Consequence of #19 + #18. It is the only recovery path for anyone who closed the card, and without it unreviewed profiles sit dead forever.                                             |

## Failure behaviour

| Scenario                                             | What happens                                                                        | User sees                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Generation call fails / times out                    | One retry, then complete onboarding with no profile row                              | "I'll put your profile together shortly — you're all set to start." Onboarding completes normally. |
| Thin interview, or most questions declined           | Sections that cannot be fairly inferred are written empty                            | Card with empty section(s): "nothing I could fairly infer here; add anything you'd like viper7 to know" |
| User closes the card without pressing the button     | Profile persists, `reviewedAt` null, never injected                                  | Course page shows it as "not in use yet — review to activate"                                    |
| User has completed onboarding but no profile row     | Treated as normal; viper7 behaves exactly as it does today                           | Nothing — no error, no prompt                                                                    |
| Save of an edit fails                                | Standard mutation error; onboarding is already complete so nothing is at risk        | Inline error + retry on the card                                                                 |
| Chat request with no course in context               | Attitude-only injection from the most-recently-updated **reviewed** profile          | Nothing — viper7 is subtly less generic on `/app`                                                |
| User has no reviewed profile at all                  | Nothing injected                                                                     | Nothing — today's viper7                                                                         |
| User withdraws mid-course                            | Profile row deleted in the same transaction as the onboarding tombstone              | viper7 reverts to unpersonalised                                                                  |
| Two tabs saving edits at once                        | Last write wins                                                                      | Nothing — the loser's tab shows stale text until reloaded                                        |

## Accepted risks

- **Contradictory attitudes across courses.** Two courses can hold genuinely different attitudes and only the newer is ever seen on `/app`. No merge logic.
- **Self-scoped prompt injection.** A user can write instructions into their own profile that land in their own system prompt. Verified blast radius: `searchKB` gates content via `getCourseContentForAgent(courseSlug, { userId })` — enforcement is in the DB against the user id, so a crafted profile **cannot** unlock gated course material. Worst case is a user jailbreaking their own viper7 or extracting the persona prompt. Mitigated cheaply (delimited block, framed as descriptive data not instructions, length-capped); residual accepted.
- **Concurrent edits are last-write-wins.** Single-user self-editing; no optimistic-concurrency guard.
- **Per-turn prompt cost.** Up to ~6000 chars of profile ships on every chat turn for personalised users. Bounded by #5, not otherwise optimised.
- **A user can write anything into their own profile** — someone else's PII, abuse, nonsense. Self-scoped, not moderated.

## Assumed (not confirmed)

Defaults filled in without explicit sign-off. Say the word on any of these:

- Table name `user_ska_profile`, unique index on `(user_id, course_id)`, plus `reviewedAt`, `createdAt`, `updatedAt`.
- Generation model: `sonnet`, matching `summarise.ts`.
- Per-section cap of 2000 characters (≈1500 tokens total across three sections).
- A declined answer (`''` in the answers map) is treated as **silence**, never as data — the rule `summarise.ts` already enforces.
- The profile is injected as a delimited block explicitly framed as descriptive context about the learner, never as instructions.
- The profile read joins the existing `Promise.all` in `/api/chat` (alongside `getPersona` / `getUserRoleNames`); one indexed row, no cache.
- "Retry once" means one immediate retry, no backoff.
- The card is a presentational component fed by a container, per the repo's component rules; three labelled textareas, keyboard-reachable, one primary button.

## Out of scope

- Changing the onboarding question set.
- Updating the profile from ongoing chat or lesson performance.
- Admin views of SKA profiles.
- Export / data-portability for the profile (no such surface exists for onboarding today either).
- A "regenerate my profile" action — parked. Brought back in if users report profiles that no longer fit them, at which point it needs an answer for how it treats hand-edits.
- Merging contradictory cross-course attitudes.
- Promoting `attitude` to a person-level table — brought back in if the per-course divergence turns out to matter in practice.

## Built

| Area | Files |
| --- | --- |
| Types + pure core | `src/types.ts` (`SkaProfileSchema`, `SKA_SECTION_MAX_CHARS`), `src/lib/ska-profile.ts` |
| Storage | `src/db/schema.ts` (`user_ska_profile`), `src/db/ska-profile.ts` |
| Generation | `src/ai/prompts/ska-profile.ts`, `src/ai/onboarding/generate-ska-profile.ts` |
| Machine | `src/machines/onboarding-machine.ts` (`profiling` state, version `3`), `src/machines/onboarding-implementations.ts` |
| Deletion | `src/db/course-onboarding.ts` (`deleteOnboarding` now drops the profile row in the same transaction; `loadFullTranscript` added) |
| Prompt injection | `src/ai/prompts/viper7.ts` (`skaProfilePrompt`), `src/ai/chat.ts`, `src/routes/api/chat.ts`, `src/lib/ska-profile.server.ts` |
| Transport | `src/lib/onboarding-session.server.ts` (`skaProfile` on `OnboardingTurnResponse`) |
| API | `src/routes/api/course/ska-profile.ts` (GET + POST) |
| UI | `src/components/ska-profile/*`, `src/data-hooks/use-ska-profile.ts`, chat widget wiring, `/course/$courseSlug/settings` |

**Migration not generated.** `drizzle-kit generate` prompts interactively about column conflicts on *other* tables: the committed snapshot (`drizzle/meta/0001_snapshot.json`) is well behind `schema.ts` — `sequential_lessons`, `needs_video_watch`, `machine_snapshot`, `question_source` and `consent_declined_at` all predate this work and are absent from it. Generating now would emit a large diff covering other people's changes. **Run `pnpm db:push`**, which is the workflow this repo is actually on.

## Open

- **Exact placement of the post-onboarding edit surface** on the course page. Cheap and reversible; will pick a spot consistent with the existing course page layout unless you have a preference.
- **Whether unreviewed profiles get any nudge beyond the course-page banner** (e.g. a chat prompt on next visit). Deferred; trigger is seeing a meaningful share of profiles sitting unreviewed after launch.
