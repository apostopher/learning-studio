# Shared understanding: lesson quiz carousel

## Goal

Replace the `<pre>` JSON dump at `src/components/lesson-material/lesson-material.tsx:83` with
a real UI for the lesson's authored MCQ quiz (`material.quiz`): one question per slide in a
Motion carousel, sliding forward, with the result as the final slide. Attempts persist to the
already-existing-but-unwired `lesson_quiz_answers` table.

The AI debrief test (`DebriefQuizContainer`) is a separate feature and stays untouched.

Reference implementation: `../airmanship-web/src/components/course/quiz-content.tsx` plus
`/api/quiz-answers` and `/api/quiz-result`. We follow its interaction model and fix three of
its defects (retakes never displayed, no keyboard access, silent empty/failed states).

## Decisions

| #   | Decision                              | Chosen                                                                                                                                                                              | Rationale                                                                                                                                                       |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scope                                 | Static authored quiz only; AI debrief test untouched                                                                                                                                 | Different sources, different question types; merging is a much larger job                                                                                        |
| 2   | Persistence                           | Persist to `lesson_quiz_answers` via new API routes                                                                                                                                  | Table exists with exactly the right shape and zero read/write sites; ephemeral loses work on tab switch                                                          |
| 3   | Answer interaction                    | Tap option → instant reveal. Correct → auto-advance ~1200ms. Wrong → hold until explicit Next                                                                                        | The static quiz schema has no `explanation` field; the reveal is the only feedback, and the wrong case is the one that needs reading time                        |
| 4   | Changing an answer                    | Not possible — first tap commits                                                                                                                                                     | Follows from tap-to-reveal; no back navigation                                                                                                                  |
| 5   | Result slide content                  | Score summary (correct/total, grade line, Retake) + full per-question review below, same slide                                                                                       | Only place a wrong answer can be revisited; makes "last slide is the result" literal                                                                             |
| 6   | Returning student                     | Lands directly on the result slide, no carousel, no animation                                                                                                                        | Re-answering answered questions is lost work                                                                                                                    |
| 7   | Review data source                    | The saved `answers` snapshot, not current `material.quiz`                                                                                                                            | Admins edit quizzes live; rendering against today's quiz retroactively rewrites a student's history and can reference ids that no longer exist                   |
| 8   | Retakes                               | Unlimited. Insert-only (full attempt history). Read returns latest: `ORDER BY created_at DESC LIMIT 1`                                                                                | Fixes the old repo's bug where retakes are written and never shown; no migration needed (no unique constraint exists on user+lesson)                             |
| 9   | Save timing                           | Optimistic — advance to result slide from in-memory answers; POST once, guarded by a ref                                                                                             | Score is computable client-side; blocking the payoff on the network punishes a student for a problem they can't fix. Guard prevents duplicate attempt rows       |
| 10  | Save failure                          | Score and review stay visible; inline "Couldn't save your result — Retry" strip on the result slide                                                                                  | Silent failure means they navigate away believing it saved and return to an empty quiz                                                                           |
| 11  | Save success                          | `setQueryData` the saved row into the result cache, then clear stored progress                                                                                                       | Tab reads as completed without a refetch                                                                                                                        |
| 12  | In-progress state                     | jotai `atomFamily` keyed by `lessonSlug`, in `src/atoms/`                                                                                                                            | Bare global atoms (the existing `currentQuestionIndexAtom` pattern) leak index and answers across lessons; local `useState` dies on tab switch and CLAUDE.md forbids it |
| 13  | Progress across refresh               | `atomWithStorage`, key `quiz-progress:${userId}:${lessonSlug}`; `ClientGate`/`getOnInit` to avoid hydration mismatch                                                                  | Matches `src/atoms/chat-widget.ts` precedent. User namespace because localStorage is per-browser and two students may share a laptop                            |
| 14  | Clearing stored progress              | On the mutation's `onSuccess` — **not** on reaching the result slide                                                                                                                 | Clearing at the result loses the attempt from both localStorage and the DB if the POST then fails                                                                |
| 15  | Stale stored progress                 | Validate on read (every answered `questionId` still exists; every `userOptionId` is still an option). Discard silently if not                                                         | Admin edits between sessions otherwise restore an index past the end, or answers referencing deleted options                                                     |
| 16  | Invalid quiz data                     | Filter to questions with ≥2 options and a `correctOptionId` present among them. Report drops to Sentry **from the material route**, with the lesson slug                               | The editor permits all three defects. Rendering them shows "you're wrong" with no option marked correct — the worst outcome for a student                        |
| 17  | Score denominator                     | Count of surviving (valid) questions                                                                                                                                                 | "3/5" always reflects what was actually asked                                                                                                                   |
| 18  | Empty / all-invalid quiz              | "No quiz available for this lesson yet." — matching `KeyPoints`' wording                                                                                                              | Old repo renders `null`, an unexplained blank panel                                                                                                             |
| 19  | Slide transition                      | `AnimatePresence mode="wait"`, keyed by index. Exit `x: -40`/opacity 0, enter from `x: 40`/opacity 0. Spring `{ stiffness: 300, damping: 30 }`                                        | Proven in the old repo and consistent with `chat-window`/`key-points`; deterministic, no absolute-positioned exit                                                |
| 20  | Height changes between slides         | Wrapper `motion.div` with `layout` so panel height animates                                                                                                                          | Option counts vary per question; without it the panel snaps every advance, and hugely on entering the tall result slide                                          |
| 21  | Reduced motion                        | `useReducedMotion()` → opacity only, no x, no layout animation                                                                                                                       | Matches the `initial={reduced ? false : …}` gate in `key-points.tsx` / `question-card.tsx`                                                                       |
| 22  | Slide direction                       | x sign is direction-aware, flipped under RTL                                                                                                                                         | CLAUDE.md mandates logical properties; a visual-axis transform is an allowed exception but a hardcoded direction slides backwards in RTL                         |
| 23  | Swipe / drag                          | None                                                                                                                                                                                 | A drag could skip an unanswered question and reach the result with holes                                                                                        |
| 24  | Option element                        | `<button type="button">` in a `<ul>`; `disabled` after reveal                                                                                                                        | Old repo's `<li onClick>` is unreachable by keyboard. Radios promise a changeable selection, which tap-to-commit doesn't offer                                   |
| 25  | Reveal announcement                   | `aria-live="polite"`: "Correct." / "Incorrect. The correct answer is: {option}."                                                                                                     | The reveal is purely visual otherwise                                                                                                                           |
| 26  | Focus on advance                      | Moves to the new slide container (`tabIndex={-1}`), labelled "Question N of M"                                                                                                        | Focus is otherwise on a button that just unmounted and falls back to `<body>`                                                                                   |
| 27  | Loading gate                          | Skeleton until the result query `isFetched`; taps rejected before then. Background refetches keep the result slide on screen                                                          | A tap made before the cached result lands is discarded with no explanation, or worse starts an unintended second attempt                                        |
| 28  | Content rendering                     | `dangerouslySetInnerHTML` with the `material-prose` class, as `key-points.tsx` does                                                                                                  | Quiz content is HTML, not markdown, despite the schema's stale `.describe('...markdown...')` — documented in `quiz-field.tsx` (268 questions / 1037 options)      |
| 29  | API shape                             | `createFileRoute` under `src/routes/api/lesson/quiz/*`, `auth.api.getSession`, zod-validated body, `userId` from `session.user.id` only                                               | House pattern across every route. Never trust a body-supplied `userId`; do not copy `ai-test/save-results.ts`'s hardcoded `"dev-user"`                          |
| 30  | AI test collision                     | No change to the `lesson-material.tsx:77` ternary — the AI test wins when present                                                                                                    | `currentTestAtom` isn't persisted so a reload restores the static quiz, and localStorage preserves mid-quiz progress                                             |

## Failure behaviour

| Scenario                                        | What happens                                                                       | User sees                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `material.quiz` is null or `[]`                 | Empty state, no carousel mounted                                                    | "No quiz available for this lesson yet."                                        |
| Every question invalid                          | Same as above; Sentry event with lesson slug                                        | Same as above                                                                   |
| Some questions invalid                          | Invalid ones filtered out; Sentry event                                             | A shorter quiz; score denominator matches what was asked                        |
| POST fails (offline, 500)                       | Result slide already rendered from memory; stored progress NOT cleared              | Full score and review, plus "Couldn't save your result — Retry"                 |
| Retry succeeds                                  | Cache seeded, stored progress cleared                                               | Strip disappears                                                                |
| Refresh mid-quiz                                | Progress restored from localStorage, validated against current quiz                 | Same question they were on                                                      |
| Refresh mid-quiz after an admin edited the quiz | Stored progress fails validation, discarded                                         | Quiz restarts at question 1                                                     |
| Refresh after result but before a successful save| Progress still stored; result recomputed                                            | Result slide, retry strip still available                                       |
| Result query in flight (first load)             | Quiz not mounted, taps impossible                                                   | Skeleton                                                                        |
| Result query errors                             | Falls through to `LessonError`-style message with retry (panel convention)          | Explanation + Retry                                                             |
| Not authenticated                               | GET/POST return 401                                                                 | Handled by the existing lesson-page auth gate; quiz tab never renders logged-out |
| Two browser tabs, both complete                 | Two attempt rows; latest-by-`created_at` wins on next read                          | Both tabs converge on refetch                                                   |
| Student taps Debrief mid-quiz                   | Panel swaps to the AI test; static progress stays in localStorage                   | AI test; static quiz resumes after reload                                       |
| Double-tap an option / Next                     | Second tap ignored (reveal guard + single-fire ref on submit)                       | Nothing — one advance, one attempt row                                          |
| Tab switched during the 1.2s auto-advance       | Timer cleared on unmount                                                            | Same question on return, still revealed                                         |

## Accepted risks

- After finishing an AI debrief test, the authored quiz is unreachable until page reload, and nothing on screen says so. (Decision 30.)
- A quiz edited by an admin between a student's attempt and their review is reviewed against the old snapshot; the student never sees the corrected version.
- Attempt rows accumulate without bound — unlimited retakes, insert-only, no pruning. Small rows, but nothing cleans them up.
- An admin previewing a lesson via `adminBypass` who takes the quiz writes a real attempt row under their own user id.
- `atomFamily` entries are never evicted; a long session across many lessons holds one entry per visited lesson.

## Assumed (not confirmed)

- Grade wording on the result slide follows the old repo: "Perfect score!" / "Great job!" (≥70%) / "Keep practicing!".
- Options are labelled A, B, C… as in the old repo.
- A progress bar sits above the question, animating with the same spring, as in the old repo.
- Wrong-answer visual treatment matches the old repo: correct option green with a check, wrong pick red with an X and a shake, others dimmed.
- New files follow house conventions: presentational parts in `src/components/lesson-material/parts/` (kebab-case), a container alongside, atoms in `src/atoms/lesson-quiz.ts`, data hooks in `src/data-hooks/`.
- Tests go in `parts/__tests__/`, with pure logic (validation, scoring, progress restore) extracted for testability, following `compute-material-panel-state.ts`.

## Out of scope

- Any change to the AI debrief test or its components.
- Admin quiz authoring UI — including adding validation there to prevent the invalid questions decision 16 filters out. (Would come back in if Sentry shows the filter firing often.)
- A "quiz completed" signal feeding course progress or the sidebar.
- Reporting or analytics over the attempt history now being retained.
- Fixing `ai-test/save-results.ts`'s hardcoded `"dev-user"` — a real bug, but a different feature's.

## Deviations found during implementation

- **Sentry reporting moved server-side.** Sentry is initialised only in `instrument.server.mjs` (via `NODE_OPTIONS`); `router.tsx` has no client init, so a client-side `captureMessage` would have gone nowhere. The drop report therefore lives in `GET /api/lesson/material`, which already reads the quiz, and imports the SDK dynamically so it stays out of the client bundle (verified: no `captureMessage` in `.output/public`). Both sides share `partitionQuiz`, so client and server agree on what "unaskable" means.

## Open

- Whether to add a unique constraint and switch to upsert — forced if attempt-row volume ever becomes a problem.
- Whether the result slide should offer "review against the latest version of this quiz" — forced if admins start editing quizzes students have already taken and complaints follow.
