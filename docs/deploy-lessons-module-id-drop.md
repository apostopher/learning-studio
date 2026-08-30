# Deploying Task 7: dropping `lessons.module_id`/`lessons.rank`/`lesson_dependencies`

This repo has no CI workflow or deploy hook that sequences app deploys
against hand-written migrations (`db:migrate-*` scripts) — every one of them
is run manually, on the honor system of whoever is deploying reading its
header comment. This doc is the runbook that comment points at, because the
ordering here has no safe shortcut.

## Why there is no ordering that "just works"

The code in this deploy (`createLesson`/`moveLesson` no longer writing
`lessons.module_id`/`lessons.rank`) and the migration that drops those
columns (`migrate-drop-lesson-module-id.ts`) have a hazard in **both**
directions:

- **Deploy the code first.** `lessons.module_id` is still `NOT NULL` (the
  migration hasn't run yet) but the new code stops supplying it on insert.
  Every `createLesson` call fails outright with a NOT NULL violation until
  the migration runs.
- **Run the migration first.** The columns are gone, but the OLD code is
  still live (deploy hasn't finished/rolled out yet) and still writes
  `moduleId`/`rank` on every `createLesson`/`moveLesson` call. Those same two
  admin actions fail with "column does not exist" until the new code takes
  over.

Landing them "together" doesn't remove this — it only makes the window
small. There is no atomic way to deploy an app and run a database migration
as one operation here.

## The actual fix: relax before either side moves

`pnpm db:relax-lesson-module-id` (`migrate-relax-lesson-module-id.ts`) drops
`lessons.module_id`'s `NOT NULL` constraint. That's compatible with **both**
the old code (still writes the column — a nullable column is happy to
receive a real value) and the new code (stops writing it — a nullable column
doesn't require one). Once it has run, there is no bad order left: the code
deploy and the contract migration can happen in either order, or days apart,
without a live window where an admin write 500s.

## The order

1. **`pnpm db:relax-lesson-module-id`** — makes `module_id` nullable.
   Idempotent; safe to re-run.
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
