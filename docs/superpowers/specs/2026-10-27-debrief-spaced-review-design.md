# Debrief as spaced review — design

Date: 2026-10-27
Status: draft for review

## Intent

A debrief taken straight after a lesson tests short-term memory: the video is
still fresh, so the pilot is re-reading rather than recalling. Delaying the
debrief by 24 hours turns it into retrieval practice, which is what makes the
lesson stick. Every lesson runs its own clock, so a pilot who works through
several lessons in a sitting gets each debrief a day after finishing that
lesson.

To make room for that, the debrief stops being part of "finishing a lesson".
A lesson is **done** when its progress ring reaches 100% (video, material tabs,
quiz — never the debrief). Being done is what unlocks the next lesson and what
starts the debrief clock. The debrief becomes a separate, recurring
obligation, signalled in the lesson list with a red **D** until the pilot
scores par.

## Goals

1. **Debrief opens 24h after the lesson is done.** Generation still happens
   early (at video start) so it is ready the instant it opens.
2. **Par is 70** (of 100) for every debrief. A single constant; no admin
   setting yet.
3. **Below par → locked again for 24h, then a freshly generated debrief.** No
   limit on attempts. Passing ends it.
4. **Quiz tab returns on every lesson** that has an authored quiz, alongside
   Debrief (today they are mutually exclusive — ledger D21 is superseded).
5. **Lesson and module progress = video + material tabs + quiz.** The debrief
   counts only toward **course** progress (see "Course progress, course done,
   promotion").
6. **"Done" (100%) gates the next lesson**, replacing "video watched" (ledger
   D1/D19 are superseded). The lock message names exactly what the pilot still
   has to do.
7. **Lesson-list ring shows debrief state** (red D / tick).
8. **Times shown in the pilot's own timezone.**

## Non-goals

- Per-lesson or per-course par. 70 for everyone, "for now".
- Notifications (email/push) when a debrief opens.
- Changing the debrief generator, question types, or grading.
- Debrief D/tick on module-, course-, or course-card rings. Lesson list only
  (the course ring's percent does include debriefs).
- Certificates.
- Hardening the score against a tampered client (the client posts
  `totalScore`; the server only range-checks it). Pre-existing; noted under
  Risks.

## Anti-goals (would make this a failure even if it "works")

- A pilot stuck with no explanation: any lock, wait, or disabled state that
  does not say why and what unlocks it (and say it in the accessible name).
- A debrief that opens early because some state was lost (this is why clocks
  are derived from Postgres, not Redis TTLs).
- Handing debrief questions to the client before the debrief is open.
- A red D that is illegible or below WCAG AA at the lesson-list ring size.

## The behaviour, end to end

### States of one lesson's debrief

| Moment | Lesson-list ring | Debrief tab |
|---|---|---|
| Not yet done | Progress (video + tabs + quiz) | Locked: "Opens 24 hours after you finish this lesson" + what is left to finish |
| Done, within 24h | Full ring | "Opens {date, time}" |
| Open, never attempted | Red **D** | Debrief ready to take |
| Just submitted, below 70 | Red **D** | Score report for that attempt (see "my calls") |
| Revisited while waiting to retake | Red **D** | **Only** "Next attempt opens {date, time}" — no report, no history |
| Reopened after a failed attempt | Red **D** | A freshly generated debrief |
| Scored ≥ 70 | Full ring with a **tick**, no D | All attempts listed (history is visible only now) |

Lessons with `has_debrief = false` or no debrief source (`canDebrief` false)
never show D or a Debrief tab.

### Definitions

- **Done**: the lesson's progress percent is 100, where percent is the mean of
  the components that apply (existing `componentFractions`, minus debrief, plus
  quiz on every lesson that has authored questions). The existing fallback
  stays: a lesson with no components is done once visited.
- **doneAt**: the moment the lesson first became done (see "Done is sticky").
- **availableAt** = `max(doneAt, completedAt of the latest attempt with
  totalScore < 70) + 24h`, and only while no attempt has `totalScore ≥ 70`.
- **Passed**: any `lesson_test_results` row for this user+lesson with
  `completed_at IS NOT NULL AND total_score >= 70`.

### The post-video Debrief button is removed

`compute-player-overlay.ts`'s `'debrief'` kind, `debrief-overlay.tsx`, the
`onDebrief` handler in `lesson-player-container.tsx`, and the `vp-debrief-*`
styles in `src/styles.css` all go. The coverage overlay stays.

### Tabs

Order: Key Points, Quiz, Debrief, Pro Tips, Links, Assignments, then Job of the
Day / TEST THIS!. Quiz appears when the lesson has authored questions; Debrief
appears when `hasDebrief && canDebrief`. Debrief gets its own tab value
(`'debrief'`) — the reason for reusing `'quiz'` (the overlay's jump) is gone.
`resolveActiveTab`'s fallback already covers a stored value that no longer
exists.

The Debrief tab is selectable in every state above, so the pilot can always
find out when it opens. Opening it is not a tracked section and never affects
progress (as today, ledger D22).

### Lesson-list ring

`CircularProgress` in `src/components/ui/circular-progress.tsx`, used at
`src/components/sidebar/lesson-link.tsx:76` (size 20). New visual states for
this usage only: red D (debrief open, or waiting to retake), and filled + tick
(passed). The ring's accessible name carries the state in words, e.g.
"Lesson 4, 100% complete, debrief ready" / "…, debrief reopens Tue 28 Oct,
3:40 PM" / "…, debrief passed". Red comes from the generated red scale via
semantic tokens — no hardcoded colours. The D must meet WCAG AA against
whatever it sits on, at a legible size; if 20px cannot carry a legible D the
ring grows for that state rather than shrinking the letter.

### Next-lesson lock

`isLessonSatisfied` (`src/lib/lesson-gating.ts:142`) switches from
`watchedLessonSlugs` to done lessons. `canBlock` must be revisited: today a
lesson with no video can never block (it is trivially satisfied); now a
video-less lesson with a quiz or tabs can, and the transitivity argument in
that comment has to be re-made for the new predicate.

Lock copy names every outstanding item of the blocking lesson, e.g. "Finish
Lesson 4 first: watch the video, take the quiz, and open Links and
Assignments." This replaces "Finish X first" in `sidebar/lesson-link.tsx`,
`lesson-main/parts/lesson-locked.tsx`, `lesson-empty.tsx`, and the library
tile. The server must therefore return, per blocking lesson, which components
are missing (not just a percent).

Lessons that are read-only because they were completed at an earlier level
(`isMaterialReadOnly`) disable section-tap recording today. They must count as
done for gating, otherwise they can never satisfy a lock.

### Clock and generation, server side

- **No Redis for clocks.** `availableAt` is computed from Postgres every time.
- **Prepared debrief storage must outlive the wait.** Today
  `prepared-debrief.server.ts` keeps it in Redis for 2h; it now has to survive
  until claimed (≥ 24h, realistically days). Move it to Postgres (new table, or
  a `lesson_test_results` row with `completed_at` null — the builder picks;
  `debriefAnswered`-style checks already test `completed_at`). Served once, as
  today.
- **When generation runs:** at video start (as today, via
  `usePrepareDebriefOnPlay` → `/api/lesson/ai-test/prepare`), and again in the
  background right after a below-par attempt is saved, so the retake is ready
  when it reopens. For lessons with no video, generation runs on first visit.
  The prepare route's current guard (`materialLock.kind === 'video-locked'`)
  must change accordingly.
- **The generate route refuses** before `availableAt`, after a pass, and when
  the lesson is not done — the client hiding the button is not the gate.
- **Fix the `'dev-user'` placeholder** in
  `src/routes/api/lesson/ai-test/save-results.ts:100`. Today every debrief is
  saved against `'dev-user'`, so no real pilot has an attempt history. This
  whole feature is per-pilot attempts, so it is in scope. (`results.ts`
  already reads by session user.)

### Done is sticky

`doneAt` is recorded once, the first time a lesson reaches 100%, and is not
revoked if an admin later adds a tab or quiz that drops the live percent. The
ring still shows the live percent; the gate and the debrief clock use the
recorded `doneAt`. Rationale: revoking would re-lock lessons the pilot has
already moved past and could restart a clock they are halfway through.

Recording it: whenever a progress write happens (video milestone, section tap,
quiz submit, lesson visit), recompute that lesson's percent and insert
`doneAt` if it is 100 and not yet recorded. Storage is the builder's call (new
`lesson_completions` table keyed by user+lesson is the obvious shape).

### Pilots already part-way through

Backfill `doneAt` for every user+lesson that is at 100% under the new
definition, using the latest of the timestamps that completed it (18th
watched milestone's first `videos_progress.created_at`, each counted section's
`lesson_material_progress.created_at`, the quiz's first answer, the visit).
Then:

- done > 24h ago and never passed → red D immediately;
- an existing attempt ≥ 70 → tick. (In practice there are none for real users,
  because of `'dev-user'`.)

## Timezone

There is no stored user timezone. Format on the client with the browser's
timezone (`Intl` + date-fns, already installed); the server returns
`availableAt` as an ISO instant. Render the time client-side only to avoid an
SSR/hydration mismatch. Format: "Tue 28 Oct, 3:40 PM" (with the year when not
the current year). When `availableAt` passes while the page is open, the tab
and ring flip without a reload (refetch at `availableAt`).

## Constraints

- Project rules: presentational/container split, jotai + TanStack Query data
  hooks, Base UI, logical CSS properties, generated Radix colour tokens with
  AA-or-better text (`--color-N-text` tokens are AAA).
- Tests assert on what the consumer received (CLAUDE.md), and each regression
  test is shown red against the unfixed code.
- `drizzle/` migrations are stale: schema changes go through `db:push` on dev
  and a hand-written migration for prod; never `drizzle-kit generate`.
- Ledger decisions superseded by this design: D1, D19, D21. Update
  `docs/superpowers/specs/2026-08-01-lesson-completion-ledger.md` and the code
  comments that cite them (`course-progress-agg.ts`, `compute-material-tabs.ts`,
  `compute-player-overlay.ts`, `lesson-gating.ts`, `progress-components.ts`).

## Calls I made (not discussed — check these)

1. **Done is sticky** (above).
2. **Immediately after a below-par submission**, the pilot sees that attempt's
   score report (they have just answered; hiding the result would be
   confusing), with "Next attempt opens {time}". Every later visit during the
   wait shows only the reopen time, as agreed.
3. **History after passing** is a list of attempts (date, score, pass/below
   par), passing attempt first, each expandable to its full score report.
4. **Quiz "finished"** = submitted, any score. The quiz has no par.
5. **Lessons without a debrief** at 100% show the plain full ring — no tick.
   The tick means "debrief passed".
6. **Generation for video-less lessons** runs on first visit.
7. **Tab order** as listed above.
8. **Retake button** in the score report goes away; retakes happen only by the
   tab reopening.
9. **The lesson's own video lock stays.** Tabs and quiz remain hidden until
   the lesson's video is watched (`MaterialLock 'video-locked'`), so on video
   lessons "done" is always video first, then tabs and quiz.
10. **Module prerequisites use "done" too.** A prerequisite module is satisfied
    when every available lesson in it is done. Module-lock copy names the count
    and the first unfinished lesson with what it is missing, e.g. "Finish
    Module 2 first: 3 lessons left. Next: Lesson 4 — take the quiz and open
    Links." The server returns that first lesson's missing items plus the count.
11. **Every lesson that can generate a debrief gets the full flow**, including
    transcript-sourced and derived-key-point debriefs. `canDebrief`'s narrower
    meaning existed only to stop those becoming a progress requirement; the
    debrief no longer counts toward progress at all, so the generator's own
    rule (`resolveDebriefSource`) decides whether the Debrief tab exists.
    For course percent and course-done (SQL, which cannot fetch captions), a
    lesson counts as debrief-bearing when it has material text, or once the
    server has prepared or saved a debrief for that pilot — so a lesson whose
    captions prove unusable can never hold a course open forever.
12. **Read-only and out-of-tier lessons get no debrief clock and no D.** The
    generate and save routes refuse them (as save already does for out-of-tier),
    so a D can never appear that the pilot cannot clear.
13. **Promotion reads sticky `doneAt`** (plus debrief passes), the same
    source as the gate, so a pilot can never be unlocked yet unpromotable.
14. **A prepared debrief is discarded if the lesson's material or transcript
    changed after it was generated** (stamp it with the source's `updated_at`);
    the next claim regenerates on demand.

## Open questions (for Rahul)

1. ~~On deploy, keep open or re-lock?~~ **Decided: re-lock.** No
   grandfathering. A pilot past a lesson the new rule counts as unfinished goes
   back and finishes it; the lock copy tells them exactly what is missing. The
   backfill computes `doneAt` from the new 100% rule only.
2. ~~Should passing debriefs be required for promotion?~~ **Decided: yes** —
   see "Course progress, course done, promotion".

## Course progress, course done, promotion

Decided by Rahul: debriefs do not belong to lesson or module progress, only to
**course** progress. "Course progress = lessons progress + debriefs done."

- **Course percent** = mean over items, where items are every available lesson
  (contributing its lesson percent) plus every debrief-bearing lesson
  (contributing 100 if passed, else 0). A 10-lesson course with a debrief on
  every lesson has 20 items; all lessons done and no debriefs passed = 50%.
  (My reading of Rahul's formula. Note this replaces today's "mean of module
  means" with a flat mean over items, so module size now weights the course
  percent.)
- **Module percent** and **lesson percent** exclude debriefs, as above.
- **Course done** = every available lesson done AND every debrief-bearing
  lesson's debrief passed. It is the hook a future certificate will build on.
- **Promotion** (`isTierComplete`) requires every lesson at the pilot's current
  tier done (sticky `doneAt`) AND each of their debriefs passed.
- "Debrief-bearing" excludes read-only and out-of-tier lessons (call 12), so
  course done can never wait on a debrief the pilot is not allowed to take.
- Course percent appears wherever it does today (`course-sidebar-header.tsx`,
  `courses/course-card.tsx`).

**Certificates are out of scope** (my call — nothing exists for them in the
code yet). This design only defines "course done"; issuing a certificate is
the next project.

## Left to the builder

- Storage shape for prepared debriefs and `doneAt`.
- How the server computes "what's missing" for lock copy (reuse the
  `progress-components.ts` columns).
- Exact ring visuals within the constraints above.
- Whether `getCourseProgress` grows `debrief` fields or a sibling query feeds
  the lesson list.

## Risks

- **Stricter gating re-locks lessons a pilot has already opened** (decided,
  no grandfathering). Expect support questions on deploy day; the lock copy is
  the mitigation, so it must be exact.
- **Promotion now needs the quiz and debrief passes.** Pilots close to a
  promotion today will be held back until they pass their debriefs, each of
  which can take 24h+ per retry.
- **Client-trusted score.** With par now gating something, a modified client
  could post 100. Accepted for now.
