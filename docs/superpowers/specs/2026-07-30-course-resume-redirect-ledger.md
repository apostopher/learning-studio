# Shared understanding: resume-to-last-lesson on course entry

## Goal

Opening a course lands the learner on a real lesson — where they left off when we
know, the first lesson they can actually open when we don't — instead of the dead
`Pick a lesson from the sidebar to begin.` empty state at
`/course/$courseSlug`. The onboarding chat widget must not flash open on a page
that is about to navigate away, and the browser Back button must not trap anyone.

## Decisions

| #   | Decision | Chosen | Rationale |
| --- | -------- | ------ | --------- |
| 1 | What `/course/$courseSlug` becomes | A pure redirector: `redirect({ replace: true })` in the route's `beforeLoad` | `CourseSidebarWrapper` already renders the full course overview (modules, lessons, progress, locks) on the layout route, so an index page would duplicate what is permanently on screen. `replace: true` keeps the index out of history, so Back from a lesson goes to `/app` instead of bouncing through a redirect. |
| 2 | Where the resume pointer lives | Server-side, read in `beforeLoad` via a server function | The app is SSR (`tanstackStart()` + `nitro()`, `setupRouterSsrQueryIntegration`, no `ssr: false`), so `beforeLoad` runs on the server on a cold load — `localStorage` does not exist there. Only a server-side store makes the redirect happen before anything renders, which is what makes the flash structurally impossible. It is also cross-device. |
| 3 | How the pointer is produced | An explicit write, not derived from `videos_progress` | Milestones start at **10%** (`course-milestones.ts`), and `lessons.videoId` is nullable — so a text-only lesson, or a lesson skimmed for two minutes, records nothing. Deriving would resume a learner to the lesson *before* the one they were actually on. Progress reporting is also deliberately lossy (`sendBeacon`, fire-and-forget), fine for a progress bar, not for deciding where someone lands. |
| 4 | Storage shape | New table `course_last_viewed`: `user_id`, `course_id`, `lesson_id`, `viewed_at`; unique index on `(user_id, course_id)`; `lesson_id` FK → `lessons.id` **`onDelete: 'set null'`** | Keeps learning activity separate from entitlement, and gives a future "delete my learning history" a clean home. **The `set null` is load-bearing:** the codebase's prevailing `onDelete: 'cascade'` would, on this FK, delete a learner's row when an admin deletes a lesson. (Chosen over two columns on `course_subscriptions`, which was the alternative recommendation.) |
| 5 | First-visit target (no pointer) | First lesson in `(module.rank, lesson.rank)` order that is both `isAvailable` and unlocked per `lesson-gating.ts` | Identical to "first lesson by rank" for a healthy course. They diverge exactly when lesson one is unpublished or module one has a dependency — where naive first-by-rank makes a brand-new learner's first impression a lock screen. Reuses the existing predicate; `beforeLoad` already needs `getCourseDetailsWithCache` to resolve slugs. |
| 6 | Where the onboarding auto-open moves | The course layout component in `course.$courseSlug.tsx` | The index component no longer mounts, so its auto-open effect would never run — the feature would silently die. The layout is the true "entered this course" boundary: mounts on arrival, stays mounted across lesson navigation, so it fires once per course visit exactly as today. `hasCheckedRef` and the `courseSlug`-reset effect transfer verbatim (the layout is reused, not remounted, on course switch). Bonus: a bookmarked lesson URL now also gets the offer. |
| 7 | Pointer resolves to a now-locked lesson | One hop to the blocker named in `LessonLock.blockedBy`; if the blocker is also locked, fall back to decision 5 | The blocker is by definition the lesson they must complete to get back where they were — the single most useful destination at that moment. Falling straight back to lesson one reads as "the app lost my progress." One hop needs no recursion and no visited set, so a malformed dependency graph cannot loop. |
| 8 | No valid target at all | Render a rewritten `LessonEmpty` naming the actual reason, in two distinct cases: no lessons published ("This course doesn't have any lessons yet") vs. lessons exist but none open ("Module 1 opens once you finish *Airspace Basics*") | Project rule: every locked or gated surface states why and what unlocks it, visibly and in the accessible name. The current copy is not merely a dead end, it is *false* here — nothing in the sidebar is pickable. The two cases have opposite remedies (wait for an admin vs. go do a prerequisite). |
| 9 | When the upsert fires | On lesson mount, immediately, **only when the lesson renders unlocked content**. A lock screen writes nothing. No dwell timer. | A lock screen is a door you bounced off, not a place you were. Skipping the write keeps the pointer meaning one clean thing — the last lesson I could actually see — and stops a learner poking at locked sidebar rows from destroying their real resume point. |
| 10 | Cold-load double round trip | Accepted, unoptimised | The dominant path is a course card in `/app`, and `defaultPreload: 'intent'` runs `beforeLoad` on hover, warming both reads before the click. The pointer read is one row on a unique index; the details read is a Redis hit. Not worth a second call site until measured. |

## Failure behaviour

| Scenario | What happens | User sees |
| -------- | ------------ | --------- |
| First ever visit to a course | No pointer row; resolve first available + unlocked lesson (D5) | Lands on lesson one. Onboarding widget auto-opens over it if status is `not_started`. |
| Returning visit, pointer valid | Resolve id → slugs from cached course details, redirect | Lands on their lesson. No flash of the empty state, no flash of the widget on a doomed page. |
| Pointed-at lesson deleted by an admin | FK `set null` blanks `lesson_id`; treated as no pointer | Falls back to D5. Silent. |
| Pointed-at lesson became locked | One hop to `blockedBy` (D7) | Lands on the prerequisite lesson, not lesson one. |
| Pointed-at lesson locked *and* its blocker locked | Falls back to D5 | Lands on the first lesson they can open. |
| Course has no lessons | No redirect possible | "This course doesn't have any lessons yet." (D8) |
| Course has lessons, none open to this learner | No redirect possible | Named blocker and what clears it. (D8) |
| Pointer's lesson id not found in cached course details (cache race) | Treated as no pointer | Falls back to D5. Silent. |
| Upsert request fails | Pointer keeps its previous value | Next visit resumes one lesson behind. No error surfaced. |
| Learner opens a locked lesson from the sidebar | Lock screen renders; no write | Their real resume point is untouched. |
| Back button from a lesson | Index was never a history entry (`replace: true`) | Goes to `/app`. No redirect bounce. |
| Reload deep inside a course with onboarding `in_progress` | Layout mounts, auto-open fires | Widget reopens over the lesson. Same condition as today, more trigger sites. |

## Accepted risks

- **Write ordering.** Rapid lesson-to-lesson clicking issues fire-and-forget writes that could land out of order, leaving the pointer one lesson off. Self-correcting on the next real visit.
- **Two tabs on different lessons.** Last write wins. Single-user app today.
- **A write on every lesson navigation** where there is none today. One upsert against an existing unique index.
- **Shared `/course/slug` links resolve per-recipient.** Sending someone the course URL lands them at *their* resume point, not yours.
- **Onboarding now opens over lesson content** rather than a blank page. No autoplay exists anywhere in the codebase (`grep autoPlay` → nothing), so it never covers a playing video.
- **Cold-load double round trip** on bookmarked course URLs (D10).

## Assumed (not confirmed)

- The write endpoint validates server-side that the lesson belongs to the course and the user is subscribed, but **trusts the client on lock state** rather than re-running the gating predicate on every lesson view. D7 corrects a bad pointer on read, so the worst case of a forged write is redirecting yourself to a blocker.
- The write is fire-and-forget, following the `use-report-video-progress.ts` precedent — no cache invalidation, no error toast.
- The pointer is per `(user, course)`. No global "last course" pointer; `/app` stays a course list.
- The onboarding auto-open's fetch-freshness guards (`staleTime: 0`, `refetchOnMount: 'always'`, `isFetched && !isFetching`) move to the layout unchanged.

## Explicitly dismissed

- **Redirect loops** — the lesson route has no `beforeLoad`, and the layout's only redirect fires on non-subscription. No path returns to the index.
- **Scale and cost at 10×/100×** — one upsert per lesson view, one indexed read per course open.
- **Migration of existing users** — single user, pre-launch. A missing pointer is just D5.
- **Locale, i18n** — not a concern this feature introduces.
- **Privacy/compliance** — last-viewed is low-sensitivity learning activity, cascade-deleted with the user.

## Out of scope

- Replacing the auto-open with a persistent "Finish setup" affordance in the sidebar. Would come back in if the widget reopening over lesson content proves annoying in real use.
- Resolving the target in `/app`'s loader so course cards link straight to the lesson. Comes back in if course-entry TTFB becomes a complaint (D10).
- Course-level content needing its own page (syllabus, certificate, discussion) — would force reopening D1.
- A "delete my learning history" flow. The separate table (D4) is what keeps this cheap later.

## Amendments made during the build

| # | Amendment | Why it was not in the ledger |
| --- | --- | --- |
| A1 | `resolveResumeTarget` takes `bypassLocks`, set for admins in `getCourseResumeTarget`. | Missed during the interview. Admins bypass all three gates everywhere else (`evaluateLessonGate`, `computeLessonLocks`); without the same bypass here, a lesson opened under bypass reads as locked on the next visit and hops the admin to a blocker that does not block them. Since the only current user is an admin, this was the common path, not an edge case. |
| A2 | The server function lives in `src/lib/course-resume-functions.ts`, not `course-resume.server.ts`. | Found by `pnpm build`, not by tests or `tsc`. A `.server.ts` module is strictly server-only, and Start's import-protection plugin fails the build when any client-reachable file imports one — a route file always is, even though the handler body is stripped from the client bundle. `course-functions.ts` (the parent route's own guard) already established the working convention. |

## Open

- Nothing blocking. D10's optimisation has an explicit trigger; D1 reopens only if course-level content is ever needed.

## Verified

Shipped and confirmed working in the browser on 2026-07-30. `course_last_viewed`
was applied via `pnpm db:push` (note: `pnpm db:generate` needs a TTY and stops
on a pre-existing column-conflict prompt unrelated to this change).
