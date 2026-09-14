# Course Remixing — design

Status: approved design. Plan 1 (`course_modules` membership) landed 2026-09-14; Plan 2 (remixing) not yet implemented
Date: 2026-09-12

## Summary

A course may **remix** other courses. Remixing CourseA into CourseB adds every
module CourseA owns to CourseB's rail, where CourseB's admin may reorder them
freely among its own. The link is **live**: a module CourseA gains later appears
in CourseB, and one it deletes leaves.

Authority splits by question. A borrowed module's *content* is edited where it
lives (CourseA); its *position* belongs to the rail it sits in (CourseB). Lesson
content was already discipline-scoped and is untouched.

**A student never learns that any of this happened.** From the learner's side
CourseB is one cohesive course: one flat module list, no provenance, no
grouping, and every gate — subscription, level, progress, playback — resolved
against CourseB.

## Vocabulary

**Source** — the course being remixed (CourseA). **Remixer** — the course doing
the remixing (CourseB). **Owns** — `modules.course_id`, which after this change
means "who may edit this module", not "which rail shows it".

## Decisions

| decision | choice | rationale |
| --- | --- | --- |
| live or snapshot | **live reference** | a source's later edits reach every remixer; a snapshot is just the manual copy we can already do |
| ordering | **one interleaved list**, appended on first remix | the remixer's admin arranges the whole syllabus; new modules land at the end where they are visible |
| whole or partial | **whole course, always** | keeps the source's cross-module prerequisites resolvable in the remixer |
| transitivity | **none** — only modules the source owns | one hop is predictable, and it makes cycles harmless rather than something to detect |
| B/I/A tags | **stay on `lessons.levels`** | a lesson's tier is a property of the material, not of a syllabus; no migration, one answer to "why can't this student see it" |
| content authority | **the owning course** | a remixer must not be able to edit material it merely borrowed |
| position authority | **the viewing course** | the rank row belongs to that course |
| remix authority | structure rights on the remixer **+ read on the source** | matches the knowledge library, where any staff member may place any org lesson without asking its author |
| student visibility | **none** | the remixer is one cohesive course |

## Schema

```sql
course_modules (                          -- membership + position
  id            integer primary key generated always as identity,
  course_id     integer not null references courses(id) on delete cascade,
  module_id     integer not null references modules(id) on delete cascade,
  rank          numeric(30,15) not null,
  created_at    timestamp not null default now(),
  unique (course_id, module_id),
  index (course_id),
  index (module_id)
)

course_remixes (                          -- which courses this one borrows from
  id                integer primary key generated always as identity,
  course_id         integer not null references courses(id) on delete cascade,
  source_course_id  integer not null references courses(id) on delete restrict,
  created_by        varchar(255),
  created_at        timestamp not null default now(),
  unique (course_id, source_course_id),
  index (source_course_id)
)
```

`modules.course_id` stays `not null` and becomes **ownership only**. Membership
and order come from `course_modules`, including for a course's own modules —
every existing module gets a backfill row, so a course that never remixes
behaves exactly as it does today.

`modules.rank` is **dropped** in the same migration. Once `course_modules.rank`
exists, `modules.rank` is a second answer to the same question, and a superseded
column left in a live database is what cost this project 87 lessons on
2026-09-11 (`lessons.module_id`, still carrying `on delete cascade` long after
`schema.ts` stopped declaring it).

`source_course_id` is `restrict`, not `cascade`: deleting a remixed source must
fail rather than silently strip modules out of every remixer. The friendly
refusal lives in `deleteCourse`; the constraint is the backstop for a code path
that forgets.

This mirrors one level up what `module_lessons` already does for lessons: a
lesson is owned by the org and *placed* into a course, with the placement
carrying the per-course rank and prerequisites. A module becomes owned by a
course and *placed* into others.

## Sync rules

These are what make "live" true. All of them are application code; none is a
trigger.

| event | effect |
| --- | --- |
| remix A into B | insert `course_remixes(B, A)`, then a `course_modules(B, m, max(rank)+n)` row for each module A **owns**, in A's current order |
| A gains a module | `createModule` writes A's own row, plus one appended row per course remixing A |
| A's module deleted | `course_modules` rows cascade; it leaves every remixer |
| un-remix A from B | delete `course_remixes(B, A)` and every `course_modules(B, m)` where A owns m |
| delete course A while remixed | refused, with the count of remixers, the way `deleteDiscipline` refuses while it still holds lessons |
| A reorders its own rail | **B is unaffected** — B's order was a deliberate act by B's admin |

**Cycles need no detection.** Because a remix takes only modules the source
*owns*, A remixing B while B remixes A means each shows the other's own modules
and there is no recursion to run away. The only rule is that a course may not
remix itself.

## Read paths

`modules.course_id` answers three different questions across 37 sites in 9
files. Conflating them is how this feature ships broken.

**1. Membership — "which modules are in this course."** These move to
`course_modules`, together, behind one shared helper so membership has exactly
one definition:

| file | what it builds |
| --- | --- |
| `db/course.ts` (×3), `db/course-content.ts` | the learner payload |
| `db/admin.ts` | the editor board |
| `db/course-progress.ts` | per-course progress aggregation |
| `db/placements.ts` | a course's placements |
| `db/library.ts` (×2) | module-level library file scoping |

Half-migrating this set is the failure mode: B's rail shows a borrowed module
while `lesson-access` still says the lesson is not in B, so the learner sees it
and is refused on click. They ship as one change.

**2. Ownership — "which course owns this module."** Unchanged, and newly
load-bearing: `getCourseIdForModuleId` is what `requireCoursePermission` is
handed when someone tries to rename a borrowed module. Moving this would let
anyone with rights on B edit A's modules.

**3. Inference — "the course for this lesson."** `getCourseSlugForLesson`,
`getCourseSlugForLessonId`, `getCourseIdForLessonId`, plus `db/lesson-playback.ts`
and `db/course-last-viewed.ts`. Each resolves lesson → module → course with
`.orderBy(courseId).limit(1)` — an arbitrary pick among the courses teaching
that lesson.

This is already latent debt; `db/placements.ts` says so, describing
`getCourseIdsForLesson` as replacing "the single-course answer
`getCourseIdForLessonId` used to give", and `lesson-course-resolution.test.ts`
pins the remaining ones' determinism. Deterministic is not correct. Remixing
turns multi-course lessons from the exception into the norm, so "lowest course
id wins" starts resolving a CourseB learner's playback, last-viewed and access
against CourseA — whose tier and level they may not hold. **Every one of those
is a visible remix leak, so fixing this is required by the student-invisibility
decision, not optional.**

The fix is to stop inferring: the learner is always at `/course/$courseSlug/…`,
so the course is threaded in from the route, `getCourseIdsForLesson` (plural,
already written) answers the org-level questions, and `getCourseIdForLessonId`
is deleted rather than repaired.

The cached learner payload in `db/course.ts` carries a version — bump it, since
a course's module list changes shape.

## Permissions

No new guard kind. Every rule is an existing guard pointed at the right course.

| action | guard | course id |
| --- | --- | --- |
| reorder / remove from B's rail | `requireCoursePermission(…, 'structure', 'update')` | **B** |
| rename / delete module, add or remove its lessons | `requireCoursePermission(…, 'structure', …)` | **the owner**, via `getCourseIdForModuleId` |
| edit lesson content, including B/I/A tags | `requireLessonContentPermission(disciplineId, …)` | none — discipline-scoped |
| remix A into B | `requireCoursePermission(B, 'structure', 'update')` **and** read on A | both |

Worked against the user story: a course manager with structure rights on B and
read on A passes rows 1 and 4 and fails row 2 on A's modules. A subject expert
staffed on A passes row 2 there and fails row 1 on B. An admin bypasses via
`ADMIN_BYPASS_ENTITIES`.

Note that a subject expert **cannot create a course** (`requireCourseCreation`
is course-manager-or-admin; RBAC rule 5 puts it plainly: "they author lessons,
they do not decide which courses the org sells"). The story's SME owns CourseA
by being staffed on it, not by having created it. Changing rule 5 is a separate
decision and is out of scope here.

## Admin UI

CourseB's column renders own and borrowed modules in one `course_modules` rank
order.

- Borrowed cards carry provenance — "from CourseA" — in the editor only.
- Controls the actor lacks are not merely absent. This codebase's rule is that a
  locked state names its reason and its remedy, so the card reads *"Edited in
  CourseA"* and links there.
- **Remixing is one button, pinned to the flagship course** (amended
  2026-09-14; the original design was a "Remix a course…" picker over every
  course the actor could read). In production "3D Airmanship" holds 7 of the
  org's 9 modules and every other course is an ITPS syllabus built around it,
  so the picker's list would be one item long. A constant
  `FLAGSHIP_COURSE_SLUG = '3d-airmanship'` in a shared lib module — commented
  as org-specific configuration — names the source; the button's label uses
  the flagship's *name* from the board payload, so a rename follows. The
  board already carries every course's slug, so nothing new is fetched, and
  if no course has that slug the button renders nowhere.
- The button sits at the start of the course column's actions, before "add a
  module", as a compact icon-plus-text control: *"Remix 3D Airmanship"*. It
  is absent on the flagship's own column (a course may not remix itself),
  and once linked it reads *"Un-remix 3D Airmanship"*. Like "add a module" it
  is offered regardless of the actor's course rights — router context cannot
  answer course-scoped `structure` per column — and the server refuses if it
  must.
- Remix is one click with no dialog: it is reversible, and the borrowed cards
  appearing at the end of the rail are the feedback. Un-remix confirms first,
  naming how many modules will leave. Both invalidate the board query.
- The board payload gains `sourceCourseId` on each module so the editor can
  draw provenance and the lock; the learner payload gains nothing (see
  Student view).
- The courses-list counts in `admin.ts` (`moduleCount`/`lessonCount`) still
  count *owned* modules and move to membership here — Plan 1 left them, since
  the two agreed until the first remix.
- The delete-module dialog gains **"used by N other courses"**: a source's SME
  deleting a module silently reshapes every remixer, which is inherent to live
  reference and should at least be said out loud.
- Dragging writes `course_modules.rank` for the viewing course only.

## Student view

Nothing changes and nothing is added. The payload for CourseB is one flat module
list with no provenance field, and every gate resolves against CourseB.

Progress needs no work: `videos_progress` is keyed by `(user_id, lesson_id)` and
`lesson_material_progress` by `(user_id, lesson_slug, section_name)` — neither
carries a course, so a completed lesson counts wherever it appears, and
per-course aggregation joins through modules and therefore follows
`course_modules`. A student enrolled in both courses carries progress across
them invisibly, which is correct under this decision.

## Edge cases

**Duplicate lessons** are surfaced, not blocked. B remixes two courses that share
a lesson, or B's own module already teaches it. A course can already hold the
same lesson twice — `healDuplicatePlacements` exists for exactly that — and
whole-course remixing makes it common. The editor flags it on the card.

**Subscription tiers** need no special handling. `SubscriptionSchema` is a global
enum (`associate | candidate | rpoc`), not a per-course product, so a borrowed
module requiring `candidate` behaves identically in both courses. Modules within
one course can already differ in tier. The only remix-specific part is that B's
admin cannot change a borrowed module's tier, which is the edit-authority rule.

**Prerequisites** survive by construction — with one rule. Whole-course
remixing means every module A owns is present in B, so both
`module_dependencies.depends_on` (module slugs) and `module_lessons.depends_on`
(lesson slugs) resolve inside B. `resolveDependency` matches on `lessonSlug`
within the course being gated and returns null when absent, which silently
drops the gate — so partial remixing would fail open. That is why "whole
course, always" is a correctness decision, not an editorial one.

The rule is the **one-hop rule** (amended 2026-09-15). A module A owns may
gate on a module A only *borrows* — an ITPS module gating on a flagship
module is the real use, and the dependency picker offers A's whole board —
but a remix carries only what A owns, so in a course remixing A that gate
would name nothing and fail open. `remixCourse` therefore **refuses** to
remix A while any module A owns gates on something A borrows (a module-level
gate naming a borrowed module, or a lesson-level gate naming a lesson in a
borrowed module), answering `source-depends-on-borrowed` → 409 with the
offending module names and both remedies: un-remix in A, or remove the
dependency. The check runs under the same source-row lock as the remix
itself and before the link row is written, so a refusal writes nothing.
Gates naming a slug that is on neither list (a deleted module's, say) are
already inert in A and are not counted.

## Migration

A hand-written idempotent script in `src/db/migrate-*.ts`, following
`migrate-material-links.ts`: inspect `information_schema` first, no-op if
already applied. Not `drizzle-kit push` — it wants to truncate `docs`, and
7,297 embedding rows are not worth the convenience.

1. Create `course_modules` and `course_remixes`.
2. Backfill one `course_modules` row per existing module
   (`course_id`, `module_id`, `rank` ← `modules.rank`). Purely additive; every
   course behaves identically at this point.
3. Switch the membership read paths behind the shared helper — all of them.
4. Fix the inference call sites; delete `getCourseIdForLessonId`.
5. Drop `modules.rank`.
6. Bump the learner payload cache version.

Step 5 is last on purpose: until every read is off it, `modules.rank` is the
rollback. Each schema step verifies against `information_schema` rather than
`schema.ts`.

## Testing

Six groups, each written red first.

1. **Cross-path agreement.** Given B remixing A: the rail shows module M *and*
   `lesson-access` admits M's lesson for a B learner *and* the payload contains
   it *and* progress counts it. This is what catches a half-migrated read path.
2. **Permission matrix** from the user story, table-driven — course manager /
   subject expert / admin × reorder in B, rename A's module, delete it, edit
   lesson content, remix. Asserting **which course id the guard was handed**, not
   merely that it threw: the bug shape is `requireCoursePermission(B)` where it
   should be `(A)`, and a pass/fail assertion agrees with both.
3. **Sync.** A module created in A appears appended in every remixer; un-remix
   deletes exactly A-owned rows and leaves B's own; deleting A while remixed is
   refused with a count.
4. **Ordering.** Appended at `max(rank)+1`; B reordering does not touch A's rail,
   and A reordering does not touch B's.
5. **Student invisibility.** The serialized B payload contains no provenance key.
   The mutant is someone adding `sourceCourseId` "just for debugging".
6. **Gating and cycles.** A borrowed module's prerequisites resolve inside B;
   A⇄B mutual remixing renders both rails with no recursion.

## Out of scope

- Changing RBAC rule 5 so a subject expert may create courses.
- Transitive remixing, and any per-course override of a borrowed module's
  content, order-within-source, or B/I/A tags.
- Surfacing provenance to students in any form.
