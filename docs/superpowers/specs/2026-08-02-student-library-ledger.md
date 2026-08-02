# Shared understanding: student Library page

## Goal

Migrate the old repo's `/library` page (`airmanship-web/src/app/library/page.tsx`) into
rmtp-studio as a per-course, student-facing list of downloadable files, gated by
lesson progress. Student read path only — the admin upload/assign surface is a
separate, later piece of work.

## What is already in the database

Established by direct query on 2026-08-02, not assumed:

| Fact | Value |
| --- | --- |
| `blob_files` rows | 92, all `library-` prefixed, 156 MB total, largest 28 MB |
| `blob_file_assignments` rows | 114 |
| `course_id` populated | 0 — `scripts/import-course.ts:477` hard-codes `null` |
| Owning course (via `modules.course_id`) | 114/114 → course 2, `itps-uas-remote` |
| module+lesson / module-only / neither | 103 / 11 / 0 |
| Files with >1 assignment | 21 (10 span more than one module) |
| Assignments on `is_available = false` lessons | 16 |
| Assignments whose `module_id` ≠ the lesson's real module | 3 (files 9, 19, 48) |
| Assigned lessons with `needs_video_watch = true` but no video | 15 |
| Types | pdf 57, xlsx 15, docx 11, png 8, pptx 1 |
| Blob store | **public** — unauthenticated `HEAD` returns 200; `addRandomSuffix: false`, so URLs are guessable |

There is no "course-wide" assignment (`module_id` and `lesson_id` both null) in the
data — the import skipped them deliberately — so the old page's third access
category has no rows and is not implemented.

## Verified outcome (against production data, 2026-08-02)

Run through `getLibraryForCourse` → `resolveLibraryFiles` with the real rows:

| | `itps-uas-remote` | `3d-airmanship` |
| --- | --- | --- |
| Rows scoped to the course | 92 files / 114 assignments | 0 / 0 |
| Hidden by the WIP filter (D9) | 10 | — |
| Visible | 82 | 0 → empty state |
| Nothing watched | 3 open, 79 locked (71 lesson, 8 module) | — |
| Everything watched | **82 open, 0 locked** | — |
| Keys in the payload | `id, name, size, type, lock` — no URL | — |

The last two rows are the ones that matter. **No file is unreachable**: under the
old code the 3 mismatched rows and the 15 no-video assignments could never
clear. And the payload provably carries no blob URL, so D10 holds by shape
rather than by discipline.

The 3 files open before any progress are the `needs_video_watch = false` /
no-video escapes inherited from `isLessonSatisfied` — intended, and listed under
accepted risks.

## Decisions

| # | Decision | Chosen | Rationale |
| --- | --- | --- | --- |
| D1 | Scope of this work | Student read path only | Admin upload/assign is net-new, not migration; gating is the hard part and is independent of it |
| D2 | Page scoping | Per-course, `/course/$courseSlug/library` | Every assignment resolves to exactly one course via `modules.course_id`; a global page would need N progress aggregations and a misleading merged list |
| D3 | Navigation | A trailing `<nav>` in `app-shell__header-main`, rendered by `CourseLayout` | Net-new chrome (no header nav exists today); course routes only, because Library is per-course. Sibling of `LessonHeader`, not inside it — that component is a `role="status"` live region |
| D4 | Nav shape | Site-wide horizontal nav, right-aligned — **not** a disclosure menu | Revised twice: a Base UI `Menu` first, then a single link, now the full nav bar from the old platform (screenshot reference: MODULES · NEWS · LIBRARY · SETTINGS). Library is the only live entry; the rest join as objects in `NAV_ITEMS` |
| D4b | Nav styling | Uppercase via CSS `text-transform`, bold, `0.06em` tracking; active item is an accent-9→accent-10 gradient block with `--color-on-accent` text | Matches the old platform's bar. Uppercasing in CSS rather than the DOM keeps the accessible name "Library" instead of an all-caps string. Contrast verified, not assumed: **9.56:1 light, 11.89:1 dark** — both clear AA, so `--color-accent-contrast` is safe here (unlike red-9/link-9, where it is not) |
| D4c | Active detection | The router's own `data-status="active"` attribute, styled in CSS | Verified present in `@tanstack/react-router`'s `link.js`. Styling on it rather than per-link `activeProps` means a new nav entry gets the active treatment automatically instead of having to opt in — the failure mode a four-item nav would otherwise hit on the fourth item |
| D4a | Where the "Library" heading lives | The page body's `<h1>`, not the pinned header | The nav item already shows Library as the active destination. Repeating it as a pinned title reads "Library … Library". The nav marks *where you are*; the heading names *what you are looking at* |
| D5 | Unlock rule, lesson-scoped | `isLessonSatisfied(lesson, watchedLessonSlugs)` — video watched, if a video exists | Same predicate and same semantics as lesson material. Matches old behaviour so nobody loses a file. Honours D19 of the completion ledger: `percent === 100` must not become an unlock condition |
| D6 | Unlock rule, module-scoped (11 rows) | Every lesson in the module satisfies D5 | Direct analogue of the old repo's "module progress 100", which was itself video-based |
| D7 | Multiple assignments per file (21 files) | Unlocked if **any** assignment is satisfied | Assignments mark relevance, not conjunction. ALL-semantics would let a new assignment revoke a file a learner already had. Replaces the old `uniqBy` + `createdAt` ordering, which picked one assignment arbitrarily |
| D8 | `module_id` when `lesson_id` is set | Ignore it; gate on the lesson alone | `lessons.slug` is globally unique and `lesson-gating.ts:180` already rules the stored module "redundant and actively harmful". Un-bricks the 3 mismatched rows that were permanently locked |
| D9 | WIP lessons (16 rows) | Drop the **assignment**; drop the file only if no assignments survive | `course-content.ts:122` drops WIP lessons before any gate runs. Filtering per-assignment keeps a file that is also attached to a live lesson |
| D10 | Download mechanism | Server route `/api/library/download/$fileId` that **streams the bytes** | Students must never see a `*.blob.vercel-storage.com` URL. Also moves the entitlement check to click time and makes a future private-store migration a server-only change |
| D11 | Route error semantics | One uniform 403 for locked / not-subscribed / no-such-file | Mirrors `src/routes/api/lesson/playback.ts`; distinguishing them is an enumeration oracle |
| D12 | Click handling | Plain `<a>`, native browser download | Native progress, resume on drop, no 28 MB buffered in a tab. Costs: errors render as pages, so the 403/502 bodies are minimal HTML with a link back, not `playback.ts`'s plain text |
| D13 | Filename on download | `Content-Disposition: attachment` with RFC 5987 `filename*=UTF-8''…` | Names contain `!` and spaces; fixes the old UI's `decodeURIComponent` mangling |
| D14 | Layout | Flat grid, `grid-auto-fit`, unlocked-first — as the old page | Explicit preference. Per-grid `--grid-auto-fit-min-width` (a file tile is narrower than a course card), meaningful gap, not cramped |
| D15 | File-type icons | `vscode-icons` (MIT, verified `@iconify-json/vscode-icons@1.2.68`), ~6 SVGs copied into a local component | Colorful and instantly recognisable, legally shippable, vector. Covers all five types present. **Rejected:** extracting `/Applications/Microsoft *.app` icons — Microsoft's copyrighted brand assets, raster, and outside `generateRadixColors` |
| D16 | Locked tile | Reason text **and** link to the blocking lesson; same text in the accessible name | `lockedResponse` exists so locks explain themselves. The old bare padlock is the one part of the old page this repo has explicitly rejected |
| D17 | Server function return shape | Per locked file: blocking lesson `name`, `slug`, and its module `slug` | D16's link needs all three to build `/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug` |
| D18 | Cache policy | `staleTime: 0`, `refetchOnMount: 'always'` | Locks are a pure function of progress changed on other pages. Follows `useOnboardingStatus`'s precedent and its stated reason. No cross-invalidation from the video player |
| D19 | Entrance animation | **CSS only** — `@keyframes` + `animation-delay: calc(min(var(--i), 11) * 30ms)`, `backwards` fill, inside `prefers-reduced-motion: no-preference` | Motion for React is for springs, `layoutId`, `AnimatePresence`, layout changes — none apply. The course grid, the closest analogue in this repo, uses no entrance animation at all. Cap keeps the sequence ~330 ms at any file count; the old `index * 0.05` would take 4.6 s at 92 files |
| D20 | Motion tokens | `--duration-library-tile` / reuse `--ease-sidebar` as CSS custom properties | Matches `src/lib/sidebar-motion.ts` doctrine: values live in CSS |
| D21 | Admin behaviour | Admins bypass the gate, as `evaluateLessonGate` already does | One idiom for "admin sees everything", not two |

## Failure behaviour

| Scenario | What happens | User sees |
| --- | --- | --- |
| Gate no longer satisfied at click time | Route re-checks, 403 | "You don't have access to this file yet" + link back to the library |
| Not enrolled / wrong course's file id | Route 403, byte-identical body | Same as above — no enumeration oracle |
| File id does not exist | Route 403, byte-identical body | Same as above |
| Blob fetch 404s (row outlived the blob) | Route 502 | "This file is unavailable. Please tell your instructor." |
| Blob fetch times out / hits the function limit | Route 502 | Same as above |
| Learner double-clicks download | Two invocations, two downloads | Browser dedupes by filename (`file (1).pdf`); not guarded |
| Course has no library files | Query returns empty | "No library files for this course yet." No grid, no count |
| Course has files but learner has earned none | Grid of locked tiles | Lead line: "Files unlock as you complete lessons." — distinct branch from the empty state |
| Library query fails | Error branch | "Failed to load your library. Please try again." — matches `MyCoursesPageContainer`'s idiom |
| Lesson unpublished while the page is open | Tile stays visible until remount | Stale tile; the download route refuses it. Cosmetic, clears on refresh |
| `prefers-reduced-motion: reduce` | No transform, no stagger | Grid simply present |

## Accepted risks

- **The blob store is public and URLs are guessable.** `library-<filename>.pdf` downloads for anyone, signed in or not. D10 makes the *app* honest; it does not make the *files* private. Fixing it means a private store, re-hosting 156 MB, and touching the training-docs and course-cover pipelines — its own piece of work.
- **Proxying costs bandwidth and invocations.** Every download is a function invocation and double bandwidth (blob → function → browser), on files up to 28 MB. Accepted as the price of D10.
- **A file unlocked via a later assignment still displays in its original grid position.** Honest and stable, mildly surprising.
- **A page left open shows stale locks.** D18 refetches on mount only. The download route re-checks, so a stale unlocked tile cannot hand over a file.
- **No pagination.** 92 tiles today; ~900 would still render, just heavily. Revisit if a course passes ~300 files.
- **`blob-sweep` does not sweep `library-`.** `SWEPT_PREFIXES = ['courses/', 'modules/']` (`src/db/admin.ts:869`). Safe today, but adding `library` to that array without also collecting `blob_files.url` would delete all 92 files. The existing warning comment at `admin.ts:866` covers it; no code change now.

## Assumed (not confirmed)

- Empty state and all-locked state are built as defensive defaults, despite `3d-airmanship` being a dummy course — they cost one string each and the condition is reachable the moment a real course ships without files.
- The Library leaf renders its own `headerMain` title ("Library"). `CourseLayout`'s comment at line 131 anticipates exactly this — a third leaf shape — and says to revisit rather than extend the `moduleSlug`/`lessonSlug` presence check.
- Data flow follows repo convention without further discussion: server function → TanStack Query hook (`use-library-files.ts`) → `library-page-container.tsx` → presentational `library-grid.tsx` / `library-file-tile.tsx`, kebab-case files, zod-validated response.
- The `url LIKE '%/library-%'` filter is kept. Redundant today (all 92 rows match), but it is the only thing separating library files from future non-library blob rows in the same table.
- Locked files are filtered server-side to `fileUrl: null` — or rather, the URL never leaves the server at all, since D10 means the client only ever holds a file id.

## Out of scope

- Admin upload + assign UI — the agreed next piece.
- Migrating to a private blob store with signed URLs.
- Search, filtering, sorting controls, or pagination.
- Backfilling `blob_file_assignments.course_id` (course is derived through `module_id`/`lesson_id`).
- Versioning or replacing files; student-uploaded files.
- Fixing the 3 mismatched `module_id` rows in the data — D8 makes them harmless at read time; a data repair belongs with the admin work.
- Settings / notifications menu items.

## Open

| Deferred | Trigger that forces it |
| --- | --- |
| Private blob store + signed URLs | A file is found circulating outside the platform, or a course carries commercially sensitive material |
| Pagination or virtualisation | A single course passes ~300 library files |
| Backfilling `course_id` | A file needs course-wide scope with no module or lesson — the admin UI's first "attach to whole course" |
| Reassessing the WIP filter | An admin asks why a file they uploaded is invisible; the answer is the lesson is unpublished |
