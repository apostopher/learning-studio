# Knowledge Library Editor — design

Status: approved design, not yet implemented
Date: 2026-08-30

## Summary

Replace the per-course horizontal module board with a single org-level editor at
`/admin/editor`: a **library** of every lesson in the org on the left, grouped
into discipline columns, and a **rail of course columns** on the right, each
stacking its modules as an accordion. Dragging a lesson from the library into a
module **links** it — the same lesson row can sit in many courses at once.

Based on the mock at `2026.08.15 - CANDA - Course Management Demo.html`
(`#kn`, `.disrail`, `.offrail`).

## Vocabulary

**Offering is an alias of course.** A "2 Week", "16 Week" and "Mini" are three
sibling rows in `courses` — exactly what the table already holds
(`itps-uas-remote`, `uas-16-week-course`, `13-week-uas-test-pilot-eng-course`).
There is no parent table and no rename. Where the mock says Offering, this
codebase says course.

This matters because it collapses what looked like a re-platforming into a
contained change. Everything already sits at the right grain:

| requirement | existing | verdict |
| --- | --- | --- |
| users buy offerings | `course_subscriptions (userId, courseId)` unique | already correct |
| offerings are variants | three sibling `courses` rows | already correct |
| each offering owns its modules | `modules.courseId` | already correct |

`courseId` / `courseSlug` has 1249 non-test read sites across 194 files. **None
of them change.**

## Decisions

| decision | choice | rationale |
| --- | --- | --- |
| library scope | every lesson in the org | user |
| drop semantics | **link**, not copy or move | one lesson, many courses; fix a dead video once |
| placement payload | **thin** — `rank` + `dependsOn` only | leaves ~335 gate read sites untouched |
| gates (`levels`, `requiredSubscriptions`, `hasDebrief`, `needsVideoWatch`, `isAvailable`) | stay on the lesson | deferred until a course genuinely needs to differ |
| progress | follows the lesson, not the enrolment | "knowledge is knowledge" |
| placements per course | at most one | keeps completion unambiguous |
| lesson ownership | `lessons.orgId NOT NULL` | an unplaced lesson still needs a home |
| editor location | org-level `/admin/editor` | courses are edited side by side |
| right pane | all courses at once, horizontal rail | cutting a Mini against the Full is the point |

### Deferred deliberately

Moving the gates onto the placement. That is the mock's stated end state — "PAID,
BRIEF, WATCH, PUB and the level are properties of the *Offering*" — and it is the
correct destination. It is deferred because it is ~335 read sites plus the
learner gating path, and the two-column UI does not need it. Move them one field
at a time, when a course actually needs a lesson gated differently.

## Schema

```
lessons
  + orgId       integer NOT NULL → organizations(id)
  − moduleId                                  dropped after backfill
  − rank                                      moves to the placement
    disciplineId  nullable                    already present; drives grouping
    name, slug, video*, and ALL gates         unchanged

module_lessons                                new
  id         integer PK generated always as identity
  moduleId   integer NOT NULL → modules(id)  ON DELETE CASCADE
  lessonId   integer NOT NULL → lessons(id)  ON DELETE CASCADE
  rank       numeric(30,15) NOT NULL
  dependsOn  jsonb                            ← folded in from lesson_dependencies
  createdAt / updatedAt
  UNIQUE (moduleId, lessonId)
  INDEX (moduleId), INDEX (lessonId)

lesson_dependencies                           dropped
```

### Why `rank` and `dependsOn` move even though gates do not

Both are properties of *where a lesson sits*, not of the lesson:

- **`rank`** — a lesson is third in the 2-Week and eighth in the 16-Week.
- **`dependsOn`** — `lesson_dependencies.lessonId` is `.unique()`, so a lesson has
  exactly one prerequisite list today. Once it is in two courses that list would
  name lessons the other course does not contain.

Neither is deferrable. Everything else the user chose to leave alone stays put.

### One placement per course

`UNIQUE (moduleId, lessonId)` only prevents a duplicate *within a module*. The
course-level rule is enforced in the write path: adding a lesson checks for an
existing placement in any module of the target course and rejects it. A DB-level
guarantee would need `courseId` denormalised onto `module_lessons`; not worth it
until something proves the application check insufficient.

## Migration

**By hand, as raw SQL. Never `db:push`.** `drizzle/` lags `schema.ts` by many
columns, and `db:push` proposes truncating `docs` (6917 embedding rows) from
unrelated drift.

Order, in one transaction:

1. `CREATE TABLE module_lessons (…)`.
2. Backfill one placement per existing lesson:
   `INSERT INTO module_lessons (module_id, lesson_id, rank)
    SELECT module_id, id, rank FROM lessons;`
3. Backfill `dependsOn` from `lesson_dependencies` by `lesson_id`.
4. `ALTER TABLE lessons ADD COLUMN org_id integer;`
5. Backfill: `lessons → modules → courses → course_orgs`, taking `MIN(org_id)`
   where a course maps to several orgs.
6. Assert no NULLs, then `SET NOT NULL` + FK.
7. `ALTER TABLE lessons DROP COLUMN module_id, DROP COLUMN rank;`
8. `DROP TABLE lesson_dependencies;`

Step 6 is the gate: if any lesson has no org, the transaction rolls back rather
than inventing one.

### Known consequence: `getLibraryForCourse`

`src/db/library.ts:66` scopes student library files by joining
`lessons.moduleId → lesson_module.courseId`. Dropping that column breaks the
query. Rewrite the join through `module_lessons`. A lesson's files will then
appear in every course using that lesson, which is correct — the file belongs to
the lesson.

### Known consequence: shared progress

All three progress tables are lesson-keyed and none is course-keyed:

| table | key |
| --- | --- |
| `videos_progress` | `(userId, lessonId)` |
| `lesson_material_progress` | `(userId, lessonSlug, sectionName)` |
| `lesson_quiz_answers` | `(userId, lessonSlug)` |

`src/db/course-progress.ts:54-81` walks course → modules → lessons and left-joins
progress with no course predicate. Once a lesson is in two courses, **a trainee
who completes it in one has completed it in both.** This is deliberate, not a
bug. Add a comment saying so on `videos_progress` and `lesson_material_progress`,
naming what would have to change to scope per course (a `courseId` column on all
three, plus rescoping `course-progress.ts`).

## UI

```
/admin/editor
┌────────────────────────────┬─┬──────────────────────────────────┐
│ LIBRARY                    │▍│ COURSES                    [+ New]│
│ ┌────────┬────────┬──────┐ │▍│ ┌──────────┬──────────┬─────────┐│
│ │Untitled│  UAS   │  FW  │ │▍│ │ 2 Week   │ 16 Week  │ Mini    ││
│ │┌──────┐│┌──────┐│      │ │▍│ │ ▾ M1  ⋮⋮ │ ▸ M1  ⋮⋮ │ ▾ M1 ⋮⋮ ││
│ ││card  │││card  ││      │ │▍│ │   lesson │ ▸ M2  ⋮⋮ │   lesson││
│ ││in 2  │││card  ││      │ │▍│ │   lesson │ ▸ M5  ⋮⋮ │ ▸ M2 ⋮⋮ ││
│ │└──────┘│└──────┘│      │ │▍│ │ ▸ M2  ⋮⋮ │          │         ││
│ │   ↕    │   ↕    │  ↕   │ │▍│ │    ↕     │    ↕     │   ↕     ││
│ └────────┴────────┴──────┘ │▍│ └──────────┴──────────┴─────────┘│
│        ← scrolls →         │▍│           ← scrolls →            │
└────────────────────────────┴─┴──────────────────────────────────┘
```

Both panes are horizontal rails; every column scrolls vertically. A draggable
splitter sits between them (the mock's `.knsplit`), its position held in
`localStorage` per browser — a view preference, not shared state.

`Untitled` — lessons with `disciplineId IS NULL` — is pinned leftmost and is not
a real discipline row.

### Components

Presentational, pure, no hooks (per `CLAUDE.md`; note component render tests null
the dispatcher, so these must stay hookless):

| file | role |
| --- | --- |
| `lesson-library.tsx` | left shell: header + horizontal rail |
| `discipline-column.tsx` | one discipline: name, count, vertical body |
| `library-lesson-card.tsx` | draggable card + "in N courses" badge |
| `course-rail.tsx` | right shell: header, `+ New`, horizontal rail |
| `course-column.tsx` | one course: header + `Accordion` root |
| `module-accordion-item.tsx` | trigger (name, count, actions, grip) + panel |

Reused unchanged: `LessonCard`, `LessonVideoTile`, `ClampedText`,
`TooltipIconButton`, `OptimizedPicture`, `ScrollArea`.

Base UI `Accordion` is already used at `src/components/sidebar/module-accordion.tsx`
and `src/components/admin/sortable-onboarding-category.tsx` — the latter is a
sortable accordion and is the pattern to follow.

Containers: `editor-container.tsx` owns **one `DndContext` spanning both panes**,
required so a card can travel from library to course.
`module-board-container.tsx` folds into it; `module-column.tsx` is replaced by
`course-column.tsx` + `module-accordion-item.tsx`.

### Drag rules

A whitelist, enforced by scoping `collisionDetection` on the dragged item's type
and origin:

| from → to | allowed | effect |
| --- | --- | --- |
| discipline → module | yes | INSERT placement |
| module → module, same course | yes | UPDATE `moduleId` + `rank` |
| reorder within a module | yes | UPDATE `rank` |
| reorder module columns | yes | UPDATE module rank |
| **course → course** | **no** | — |
| **discipline → discipline** | **no** | a lesson's discipline is edited in its config, not by dragging |

`dnd-ids.ts` gains a `library-lesson` type. Its current `String(id).split('-')`
mis-parses `library-lesson-5`; fix the parser to split on the last hyphen.

A placed lesson's droppable set is filtered to containers within **its own course
column**, so a cross-course drag has nowhere to land and springs back.

### Card states

Library cards are **never dimmed and always draggable** — a lesson can be in the
2-Week but not the Mini, so "used" is not a boolean. Each card carries an
**"in N courses"** badge (the mock's `.inoff`, deliberately a cross-reference
colour rather than a status colour), naming the courses on hover. Attempting a
second placement in a course that already has the lesson springs back with an
explanation.

### Remove vs delete

Two distinct destructive actions, needing distinct copy:

- **Remove from module** — deletes the placement. The lesson survives in the
  library and in every other course. Low stakes, no confirm.
- **Delete lesson** — removes it from the library and **every course using it**,
  cascading its progress rows. The confirm dialog must name the other courses
  affected, counted from `module_lessons`.

Per the locked-states rule, any refused interaction states its reason visibly and
in the accessible name.

## API

| route | verb | purpose |
| --- | --- | --- |
| `/api/admin/library` | GET | org lessons + disciplines + per-lesson course counts |
| `/api/admin/editor` | GET | every course in the org with modules and placements |
| `/api/admin/modules/:moduleId/lessons` | POST | link an existing lesson (extends today's create) |
| `/api/admin/modules/:moduleId/lessons/:lessonId` | DELETE | remove a placement |
| `/api/admin/modules/:moduleId/lessons/:lessonId` | PATCH | reorder / move within a course |
| `/api/admin/courses` | POST | create a course **and** its `course_orgs` row |

`courses` carries no `orgId` — a course belongs to an org through `course_orgs`.
Creating one from the org-level editor must write both rows in a transaction, or
the new course is invisible to the editor that just created it.

Every admin server fn self-guards with `requireAdmin`; all client reads go
through TanStack Query data-hooks.

Data hooks: `use-library`, `use-editor-board`, `use-link-lesson`,
`use-unlink-lesson`, `use-move-placement`. `use-move-lesson` and
`use-reorder-module` are rewritten against placements.

### Routing

`/admin/editor` is new and takes no course argument.
`/admin/$courseId/editor` redirects to it, preserving existing links.

## Testing

Per the project's testing rule — **assert on what the consumer received, not that
a value exists in state.**

- **Migration**: a backfill test asserting every pre-existing lesson has exactly
  one placement, with `rank` and `dependsOn` carried across intact.
- **Placement writes**: capture the mutation stub and assert on the arguments —
  that linking sends the resolved `moduleId`/`rank`, not merely that the cache
  changed.
- **The course-level uniqueness rule**: a second placement into a different
  module of the same course is rejected.
- **Drag whitelist**: course → course and discipline → discipline produce no
  mutation call at all. Assert the stub was not called.
- **`getLibraryForCourse`**: files still resolve to the right course through
  `module_lessons`, including the 11 module-only rows.
- **Shared progress**: completing a lesson in course A reports complete in
  course B — pinning the deliberate semantic so a future change is a decision,
  not an accident.

Every regression test must be seen red before the fix: `git stash`, run, confirm,
`git stash pop`.

Vitest cannot resolve `@/` — modules imported directly by tests use `#/`.

## Out of scope

- Moving gates onto the placement (see Deferred above).
- Scoping progress per course.
- Cross-org lesson sharing. `lessons.orgId` asserts one owning org; if genuine
  sharing arrives it becomes a join table, not a rework.
- The mock's sideways header-panning.
- Batch course creation. `+ New` creates one course at a time, arriving empty,
  like the mock's `offnew`.
- The mock's "length, weeks" field on a new offering. `courses` has no such
  column and nothing would read it. `+ New` reuses the existing
  `create-course-form.tsx` fields (name, description, cover). Add a
  `lengthWeeks` column later if something needs to display or schedule it.
- Discipline CRUD (the mock's `discnew`). `disciplines` rows are managed
  outside this editor for now; a lesson's discipline is set from its config
  dialog, never by dragging.
