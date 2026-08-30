# Deploying Task 7: dropping `lessons.module_id`/`lessons.rank`/`lesson_dependencies`

This repo has no CI workflow or deploy hook that sequences app deploys
against hand-written migrations (`db:migrate-*` scripts) — every one of them
is run manually, on the honor system of whoever is deploying reading its
header comment. This doc is the runbook that comment points at, because the
ordering here has no safe shortcut.

## Preconditions (before ANY step below)

- **`pnpm db:migrate-lesson-placements` must already have run.** It is what
  adds `lessons.org_id` and `module_lessons` in the first place. Step 2
  below (deploying the code) needs `lessons.org_id` to already exist as a
  column — `createLesson` writes to it on every insert.
- **Every course needs a `course_orgs` row.** `createLesson` refuses (throws,
  before inserting anything) when a lesson's course has none — if that
  hasn't been seeded yet, step 2's own "creating a lesson works" health
  check is the first thing that tells you, which is late to find out.
  Remedy either gap: `pnpm db:seed-org-links`.

## Why there is no ordering that "just works"

The code in this deploy (`createLesson`/`moveLesson` no longer writing
`lessons.module_id`/`lessons.rank`) and the migration that drops those
columns (`migrate-drop-lesson-module-id.ts`) have a hazard in **both**
directions:

- **Deploy the code first.** `lessons.module_id` AND `lessons.rank` are
  still `NOT NULL` (the migration hasn't run yet) but the new code stops
  supplying either on insert. Every `createLesson` call fails outright with
  a NOT NULL violation on whichever of the two columns Postgres checks
  first, until the migration runs.
- **Run the migration first.** The columns are gone, but the OLD code is
  still live (deploy hasn't finished/rolled out yet) and still writes
  `moduleId`/`rank` on every `createLesson`/`moveLesson` call. Those same two
  admin actions fail with "column does not exist" until the new code takes
  over.

Landing them "together" doesn't remove this — it only makes the window
small. There is no atomic way to deploy an app and run a database migration
as one operation here.

(`lessons.org_id` is ALSO `NOT NULL`, but is not part of this hazard —
`createLesson` resolves and writes a real `org_id` on every insert as of
this deploy, so there is nothing for a relax step to cover there — provided
the preconditions above are met. Verified against every column in
`lessonsTable`: `module_id` and `rank` are the whole set the OLD code wrote
that the NEW code stops writing.)

## The actual fix: relax before either side moves

`pnpm db:relax-lesson-columns` (`migrate-relax-lesson-columns.ts`) drops the
`NOT NULL` constraint from BOTH `lessons.module_id` and `lessons.rank`.
That's compatible with **both** the old code (still writes both columns — a
nullable column is happy to receive a real value) and the new code (stops
writing either — a nullable column doesn't require one). Once it has run,
there is no bad order left: the code deploy and the contract migration can
happen in either order, or days apart, without a live window where an admin
write 500s.

## The order

1. **`pnpm db:relax-lesson-columns`** — makes `module_id` and `rank`
   nullable. Idempotent, including after step 3: it probes for each column
   (via `to_regclass('lessons')`, resolved the same `search_path`-based way
   the DDL itself resolves the unqualified `"lessons"` it alters) first and
   relaxes only the ones still present, so running it again once the
   contract migration has already dropped them both is a clean no-op, not
   an error.
2. **Deploy this code** (the build with the dual-write removed).
   Confirm the deploy is healthy — creating and moving a lesson both work.
3. **`pnpm db:migrate-drop-lesson-module-id`** — drops `module_id`, `rank`,
   and `lesson_dependencies`, and creates `module_lessons`' new GIN index.
   Refuses to run (throws, drops nothing) if any lesson still has a
   `module_id` but no `module_lessons` placement — re-run
   `pnpm db:migrate-lesson-placements` first if it does.

Steps 1 and 3 are two different scripts on purpose: step 1 must run before
step 2, and step 3 must run after — collapsing them into one script would
put a step that has to run post-deploy directly next to one that has to run
pre-deploy, which is exactly the ordering mistake this doc exists to
prevent.
