# Shared understanding: onboarding question categories

Date: 2026-07-29
Status: awaiting confirmation — nothing built

## Goal

Admins currently author a flat list of onboarding questions per course. Group
them into admin-defined categories, and let the agent signpost moving between
categories in its own voice — wrapping the outgoing one and easing into the
next — without the interview starting to read like a form.

## Non-goal, established during the interview

**No admin-time "polish" step is being built.** The request originally included
one, but ask-time rephrasing is already implemented and working:

- `src/ai/prompts/onboarding.ts:61` — *"Rephrase the questions below in your own
  words as they come up naturally; the wording given is a starting point for
  what to cover, not a script to recite."*
- `src/ai/onboarding/ask-question.ts:8` — *"Produces the current question,
  phrased naturally given the conversation so far — never the raw `text` field
  read aloud."*

Every question already passes through a `generateText` call carrying the
persona system prompt and recent transcript. Blunt admin wording is softened at
runtime, with conversational context no precomputed rewrite could have. This
pipeline is untouched.

## Decisions

| #   | Decision | Chosen | Rationale |
| --- | -------- | ------ | --------- |
| 1 | Who defines categories | Admin, per course, free-form names | Screenshot's categories are ITPS/aviation-specific; questions are already per-course. A fixed enum would need a schema change per new course type. |
| 2 | Storage shape | Nested in existing `courses.onboarding_questions` jsonb: `[{ id, name, questions: [{ id, text }] }]` | Makes contiguity structural — an admin cannot interleave categories, so the agent can never announce the same category twice. Rename is one edit; reorder is one move; empty category is representable. |
| 3 | Runtime shape | Flatten to today's ordered `{ id, text }[]` plus category metadata per entry | `pendingQuestions()`, `selectNextQuestion`, the `answers` map, and snapshot resume all keep working unchanged. Nesting stays a storage + editor concern. |
| 4 | Existing data | `TRUNCATE course_onboarding CASCADE` (takes `course_onboarding_messages` with it) and reset `courses.onboarding_questions` to `[]`. Do **not** bump `ONBOARDING_MACHINE_VERSION`. | Dev data only, confirmed. New question ids orphan every existing answer key and stored snapshot; a clean wipe beats half-migrated rows that would re-interview the learner against a mismatched transcript. |
| 5 | Category transition delivery | Folded into the first question of the new category. No new machine states. | A standalone "Section B complete, moving to C" is the "form read aloud" register the prompt already forbids, and a separate message needs a new waiting state, a new evaluator branch for non-answer replies, and roughly double the turns against a 10–15 min target. |
| 6 | How the transition is detected | Category of last answered question ≠ category of current question | Both derive from persisted `answers`, so resume mid-category produces no spurious re-announcement with no extra state stored. |
| 7 | How prescriptive the transition is | Soft. Agent judgment, varied by context; free to skip entirely. Explicit permission not to summarise when little was shared. | A hard "always wrap the outgoing category" confabulates when the learner declined everything — declined answers store `''` and count as answered, so the category completes normally and the agent would praise three refusals. Mirrors `summarise.ts`'s existing *"do not invent an answer for it"*. |
| 8 | `DEFAULT_ONBOARDING_QUESTIONS` | One category, "Getting to know you". All five `core:*` ids byte-identical. | Ids are permanent answer-map keys. Five single-question categories would fire a transition every turn — the worst version of this feature. One category fires none, so the fallback behaves exactly as today. |
| 9 | Deleting a category with questions | Deletes the category and its questions, behind a confirm naming the count | Autosave (800ms debounce) plus a blind full-replace endpoint means there is nowhere to undo from; the confirm is the only catch point. Relocating orphans to another category would have the agent introduce them under a heading that no longer describes them. |
| 10 | Drag-and-drop scope | Reorder questions within a category; reorder whole categories. No cross-category drag, and no "Move to…" menu. | Recategorising is done by deleting and re-adding, which the user accepted. Avoids multi-container dnd-kit and the keyboard-accessibility work that is the genuinely hard part of it. |
| 11 | `resolveQuestionSet` fallback check | Must count **total questions across all categories**, not `categories.length` | Currently checks `courseQuestions.length > 0`. Under nesting, three empty categories would resolve to `'admin'` with zero questions, so `selectNextQuestion` returns `null` and the machine jumps straight to `summarising` having asked nothing. Correctness fix, not a preference. |
| 12 | Editor presentation | Each category is an accordion panel — Base UI `Accordion`, uncontrolled, multi-expand, all expanded by default, open state ephemeral | Uncontrolled keeps `OnboardingQuestionsEditor` hookless as this repo requires of presentational components (same precedent as `chat-widget-header.tsx` relying on `AnimatePresence`'s internal state). Expanded-by-default because the first use of this editor is authoring from scratch immediately after the wipe, where collapsed-by-default reads as data loss. Collapsed headers still show name, question count, drag handle and delete, and category drag works in either state. |

## Failure behaviour

| Scenario | What happens | User sees |
| -------- | ------------ | --------- |
| Category has no questions | Skipped; never announced | Nothing — no empty section introduced |
| Category fully answered, learner resumes | Skipped; no re-announcement | Conversation continues at the next unanswered question |
| Learner declines every question in a category | Agent moves on without summarising that category | A natural pivot, not manufactured praise for refusals |
| Course has categories but zero questions total | Falls back to `DEFAULT_ONBOARDING_QUESTIONS` (per decision 11) | The standard five-question fallback interview |
| Admin deletes a category mid-interview | Remaining questions shrink; already-answered ones orphan their answers (existing documented behaviour) | Interview simply covers less |
| Admin renames a category mid-interview | Earlier transcript keeps the old name | Cosmetic inconsistency in scrollback |
| LLM call fails on a transition turn | Unchanged from today's `askQuestion` failure path → machine `failed` state | Existing error handling |
| Autosave fails after a category edit | Existing "Couldn't save / Retry" affordance | Existing retry UI |

## Accepted risks

- Transition firing is not guaranteed at any given boundary, by design (decision 7). No test can assert one occurred; the testable seam is that category context reaches the prompt.
- Recategorising via delete + re-add mints a new question id, orphaning any answers keyed to the old one. Acceptable because authoring happens before learners start.
- Category deletion is unrecoverable once the debounce fires; the confirm dialog is the only guard.
- A category renamed mid-interview leaves a stale name in earlier transcript turns.

## Explicitly dismissed

- **Concurrency — admin edits during a live interview.** Already tolerated: `pendingQuestions` recomputes per turn, deleted questions orphan answers by design, `questionSetHash` tracks drift. Categories add only cosmetic risk.
- **Prompt injection via category name.** Admin question text already reaches the system prompt verbatim; no new trust boundary.
- **Screenshot Category A ("Opening — consent & comfort").** Not a category. Already implemented as machine structure: `greet.ts`, `evaluate-consent.ts`, the `awaitingConsent`/`evaluatingConsent` states, and the `CONTROLS` block. Confirmed out.

## Assumed (not confirmed)

- Max 12 categories; 50 questions total across all categories, preserving today's cap.
- Category name 1–100 chars; ids via `crypto.randomUUID()`, matching `createEmptyQuestion`.
- `hashQuestionSet` includes category id, name, and order — reordering categories changes interview order, which is what the hash exists to track.
- Questions cannot exist outside a category (structural consequence of decision 2).
- `OnboardingQuestionsEditor`'s locally-declared `OnboardingFormValues` interface gets replaced by the shared type rather than duplicated again.

## Out of scope

- Admin-time polish button — already handled at ask-time (see Non-goal).
- Merging `viper7.ts`'s persona into the onboarding prompt. The onboarding prompt imports only `brand` today and defines its tone inline; they are separate voices. Would revisit if the onboarding agent should carry the full Viper7 persona.
- Cross-category drag or a "Move to…" menu.
- Soft-delete with undo for categories.
- Learner-facing rendered category headers in the chat UI.

## Open

None blocking.
