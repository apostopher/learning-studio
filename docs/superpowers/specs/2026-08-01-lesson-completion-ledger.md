# Shared understanding: lesson completion percentage

Supersedes the first draft of this file (video/visit only). Decisions D1, D2,
D4, D7–D9 survive from it unchanged; D3, D5 and D6 are void, replaced by the
component model below.

## Goal

A lesson's percentage becomes the mean of the things the lesson actually asks
of the learner — video, sections, quiz, debrief — each counted only when that
lesson has it and the learner can reach it.

## Prior art (verified)

`airmanship-web` computes completion from video milestones only
(`src/db/lesson.ts:11`, `src/common/guards.ts:66`). Debrief and quiz never
entered completion there; `hasDebrief` gated a button, `needsVideoWatch` gated
material access. Its `lesson_material_progress` table and 250-line
`/api/lesson-progress` route have **zero callers**. There is no prior
implementation of this model to restore — it is new work.

The original proposal (`docs/lesson-progress.md`, since deleted) made
completion depend on *passing* a quiz. That is NOT what is being built: the bar
is **attempted**, not passed. No pass threshold exists anywhere in either
codebase.

## The formula

```
percent = mean(applicable components) · 100

video    = min(watchedHits, 18) / 18     applicable when hasVideo && needsVideoWatch
sections = tappedSections / applicable   always applicable (see D12)

  ── tab 2 is Quiz XOR Debrief, never both (D21) ──
quiz     = played ? 1 : 0                applicable when !has_debrief && quiz non-empty
debrief  = answered ? 1 : 0              applicable when has_debrief && keyPoints && text

no applicable components at all → visited ? 100 : 0   (the 'page' row, D7–D9)
```

Continuous, not discrete: components with a genuine fraction contribute it.
At most **three** components apply to any lesson.

## Decisions

| #   | Decision | Chosen | Rationale |
| --- | -------- | ------ | --------- |
| D1  | Does completion drive the prerequisite gate? | No — display only | Unchanged. `watched` keeps driving `isLessonSatisfied`; the lock taxonomy has no kind that could explain a section or debrief requirement |
| D2  | Do progress queries filter WIP lessons? | Yes, `isAvailable = true`, in the JOIN | Unchanged, already implemented |
| D4  | Empty modules | Excluded from the course average | Unchanged, already implemented |
| D7  | Where are visits/sections stored? | `lesson_material_progress`, `completed = true` | Table confirmed present in the deployed DB. `'page'` for the lesson visit, one row per tab for sections |
| D8  | Who writes the `'page'` row? | Server, in `GET /api/lesson/material` | Unchanged, already implemented |
| D9  | Where in that handler? | Before the material lookup | Unchanged, already implemented |
| D10 | Continuous or discrete percentage? | **Continuous** | 18 milestones exist to give exactly this resolution. Discrete leaves the ring at 0% through the longest activity in the lesson |
| D11 | Backfill for existing learners? | **None needed** | No one is using the app yet. This voids the first draft's largest accepted risk |
| D12 | Which sections count? | Only those with content | `links`, `assignments`, `jobOfTheDay` are `.optional()`; tapping a tab with nothing behind it is busywork. Same principle as a lesson with no video not requiring a watch |
| D13 | Does `keyPoints` count? | Yes, and it is effectively free | It is the default tab (`atoms/lesson-ai-test.ts:30`), tapped on arrival. Excluding it would be more honest but adds a permanent special case |
| D14 | When is the debrief applicable? | When `has_debrief` AND the generator has what it needs (`keyPoints`, `text`) — **and we make it reachable without a video** | Chosen over "reachability incl. hasVideo". See D15 |
| D15 | How does a no-video lesson reach the debrief? | Primarily the **Debrief tab** (D21); plus a shortcut button **in the no-video card**, in the slot the video player would occupy | The card button mirrors what the overlay does for video lessons — a prompt, not the only door. Requires rewriting that card's copy — see below |
| D21 | Quiz vs debrief | Tab 2 is **Quiz XOR Debrief, decided by `has_debrief` alone**. On ⇒ the Quiz tab never renders, even if the debrief cannot generate | Chosen over falling back to the quiz. Predictable for admins: the tab's identity depends on one flag, not on content completeness. The cost is surfaced in the admin UI (D23) rather than handled silently |
| D22 | Does the quiz/debrief tab count as a tapped section? | **No** | It has a real completion signal of its own. Counting the tap too would pay a learner twice for one tab and give partial credit for tapping and bouncing. Sections are `keyPoints`, `proTips`, `links`, `assignments`, `jobOfTheDay` |
| D23 | Telling the admin that Debrief hides the quiz | A note under the Debrief toggle when it is On and the lesson has a quiz, naming the count — *"Debrief replaces the lesson quiz. This lesson's N quiz questions are hidden from learners."* | Needs `hasQuiz` on `BoardLesson` and a `LEFT JOIN lesson_material` in the board query; the board reads `lessonsTable` only today. A generic "this may hide the quiz" line without the count is barely better than silence |
| D16 | Does `has_debrief` now gate the overlay? | Yes | Closes the regression against the old platform, which gated the button on it (`course-content.tsx:91`). Currently `DebriefOverlay` renders regardless |
| D17 | Quiz / debrief signals | Read `lesson_quiz_answers` and `lesson_test_results` directly | They already hold this. Writing duplicate rows into `lesson_material_progress` would create two sources of truth for "did the quiz" |
| D18 | "Debrief answered" means | `lesson_test_results.completedAt IS NOT NULL` | Rows are only written on full completion (`debrief-quiz-container.tsx:52`); no partial state is persisted anywhere. Testing the column, not row existence, stops a future partial save counting |
| D19 | Does `watched` still equal `percent === 100`? | **No — they diverge** | Forced by D1. `watched` stays "video fully watched" because it feeds the gate; `percent` is now composite. `watchedLessons` therefore counts videos watched, not lessons complete. Nothing renders it today |
| D20 | How are section taps written? | Client mutation to a new endpoint, deduped per section per lesson | A tab tap is not observable server-side, and unlike the `'page'` write there is no request that implies it. Not a beacon: taps happen mid-session, so a normal fetch can retry |

## Consequences to implement

- **`hasDebrief` already reaches the client — NO cache-key bump needed.**
  Corrected during implementation. `getCourseDetails` spreads the whole
  `lessons` row and `toLearnerCourseDetails` strips only `videoProvider`,
  `videoRef` and `otherVideoIds`, so `has_debrief` has always been on the wire
  and sits in every warm Redis entry already. Only `LearnerCourseLesson`'s
  TYPE under-declared it — which its own doc comment says it does on purpose.
  The `course-details-v2` → `v3` bump asserted earlier was unnecessary.
- **`LessonNoVideo` copy changes.** It currently reads "is published, but the
  video hasn't been uploaded" — an admin-oversight framing. When a debrief is
  reachable it should describe what the lesson *is*; the missing-video note
  survives only as a quiet sub-line where `needsVideoWatch` implies one was
  expected.
- **The Debrief button is hidden, not disabled, when unreachable.** If the
  generator has no `keyPoints`/`text`, the debrief is also not applicable to
  progress, so the learner loses nothing — a disabled control would be noise.
- **Both progress queries change again** (`db/course-progress.ts`,
  `db/course.ts`), and must stay in step or the `/app` card disagrees with the
  sidebar.
- **Section applicability needs `lesson_material`.** Joined and reduced to
  booleans in Postgres (`json_array_length(quiz) > 0`, `key_points` non-empty,
  etc.) so no lesson text or quiz JSON crosses the wire on a sidebar render.
- **`DebriefQuizContainer` needs an idle state.** It returns `null` when there
  is no current test (`debrief-quiz-container.tsx:59`), which is fine while the
  overlay is the only entry point but leaves the Debrief tab blank under D21.
  It needs a "Start debrief" action calling the same `onDebrief`.
- **The Quiz tab must disappear entirely when `has_debrief` is on**, not merely
  swap its contents — `TABS` in `lesson-material.tsx:28` is a static array
  today and becomes conditional.

## Failure behaviour

| Scenario | What happens | User sees |
| -------- | ------------ | --------- |
| Section tap write fails | Mutation retries; failure logged | Tab content as normal; that section stays uncounted until re-tapped |
| Lesson has no video, quiz, debrief or material | No applicable components → falls back to the `'page'` row | 100% once opened |
| Lesson has `has_debrief` but no `keyPoints` | Debrief not applicable, button hidden | Lesson reaches 100% without it |
| Admin adds a quiz to a finished lesson | A new component appears | Percentage drops; honest — there is genuinely new work |
| Learner half-watches a video | Video contributes its fraction | Ring moves during the video, as today |
| Redis serves a warm pre-change payload | Harmless — `has_debrief` was always in it | — |

## Accepted risks

- **Quiz applicability is approximated as `json_array_length(quiz) > 0`.**
  `partitionQuiz` drops unaskable questions client-side, so a lesson whose
  questions are *all* malformed would require a quiz the UI renders as empty.
  Already alerted via Sentry (`material.ts:37`); doing it properly means
  pulling every lesson's quiz JSON into a query that runs on every sidebar
  render.
- **`keyPoints` is a free component** (D13) — every opened lesson starts
  slightly above zero.
- **`lesson_material_progress` is a misleading home for visits and taps.**
  Raised and overruled; no migration was judged worth more.
- **A section tap is a weak signal.** It means "this tab was selected", not
  "this was read". Deliberate: it is the only signal the UI can produce.
- **The no-second-tab dead state is invisible.** `has_debrief: true` + no
  `keyPoints` + an authored quiz ⇒ the debrief cannot generate and the quiz is
  suppressed anyway (D21), so the learner gets no tab 2 at all. `has_debrief`
  defaults to `true`, so this is reachable on any lesson with thin key points.
  Deliberately NOT warned about and NOT prevented: only the D23 note was taken,
  not the dead-state warning or the disable that `isVideoWatchRequiredDisabled`
  applies to the equivalent video case. Neither the admin nor the learner is
  told. Progress is unaffected — with neither component applicable the lesson
  can still reach 100% — so this costs content visibility, not completion.

## Out of scope

- **Quiz/debrief *passing*.** The bar is attempted. No threshold exists.
- **Changing `isLessonSatisfied` or the lock taxonomy** (D1).
- **A debrief entry point for video lessons in the material panel.** They keep
  the post-video overlay.

## Open

| Deferred | Trigger |
| -------- | ------- |
| The 20 imported lessons with `needsVideoWatch: true` and no video get the debrief card treatment like any other video-less lesson | An admin asks why they don't read as "video missing" |
| `activeTabAtom` is global, not per-lesson, and does not reset between lessons | A learner reports landing on Pro Tips when opening a new lesson |
