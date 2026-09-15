# Discipline modules — design

Status: approved design, not yet implemented
Date: 2026-09-15

## Summary

A discipline may hold **modules**, and a lesson in that discipline may sit in
one of them. Their only job is to organise the library pane: an SME with a
long shelf of lessons groups them the way a course groups its modules. A
discipline module never reaches a learner, never gates anything, never
travels on a remix, and has nothing to do with `course_modules` or
`module_lessons`. Course modules are what a course *teaches*; discipline
modules are how the library is *filed*.

## Vocabulary

**Discipline module** — a named, ordered group inside one discipline.
**Filed** — a lesson that sits in a discipline module. **Unfiled** — a lesson
in a discipline but in no module; every discipline column ends with an
Unfiled group. **Untitled** (existing) — a lesson with no discipline at all;
it has no modules to be filed in.

## Decisions

| decision | choice | rationale |
| --- | --- | --- |
| membership | **exactly one module, or unfiled** | a folder, not a placement: the discipline is the shelf, the module is the box; a lesson has one discipline, so one box |
| order | **manual, by drag** — modules within the discipline, lessons within a module or within Unfiled | the SME arranges the shelf; the course rail already taught this gesture |
| authority | **discipline staff + admin**, via `requireLessonContentPermission(disciplineId, …)` | organising a shelf is content work on that discipline, the same authority that edits its lessons |
| delete a module | **unfiles its lessons** (`on delete set null`) | a box is thrown away, not its contents |
| new lessons | land **Unfiled** | creating a lesson does not need a module to exist |
| learner surface | **none** | discipline modules are library furniture |
| remixing | **untouched** | remixing moves course modules; the library is not a course |

## Schema

```sql
discipline_modules (
  id             integer primary key generated always as identity,
  discipline_id  integer not null references disciplines(id) on delete cascade,
  name           text not null,
  rank           numeric(30,15) not null,           -- order within the discipline
  created_at     timestamp not null default now(),
  updated_at     timestamp not null default now(),
  index (discipline_id)
)

alter table lessons
  add column discipline_module_id integer
    references discipline_modules(id) on delete set null,
  add column library_rank numeric(30,15);          -- order within its module, or within Unfiled

index lessons(discipline_module_id)
```

A lesson's discipline is set at creation and never changes today, so the one
invariant — **a lesson's module belongs to the lesson's own discipline** — is
enforced at the one write that could break it: the library-placement route
refuses a module of another discipline with a 400 naming both disciplines.
Should a lesson ever move between disciplines, that write must clear
`discipline_module_id` (recorded here so the future change has its rule).

`library_rank` is nullable rather than backfilled: an unranked lesson sorts
after ranked ones, by id, and gains a rank the first time it is dragged. The
migration is therefore additive — two tables' worth of DDL and nothing else —
which is why it needs no relax/drop dance.

Hand-written idempotent script in `src/db/migrate-discipline-modules.ts`,
following `migrate-course-remixes.ts`: probe first, `information_schema` on
the columns, `to_regclass` on the table, no-op if applied. Never
`drizzle-kit push`.

## Read path

`getOrgLibrary` (`src/db/editor.ts`) already reads every lesson of the org
and groups by discipline in JS. It gains one query — the org's discipline
modules — and each `LibraryDiscipline` becomes:

```ts
{
  id, name, slug,
  modules: Array<{ id: number; name: string; rank: number; lessons: LibraryLesson[] }>,  // by rank, then id
  unfiled: LibraryLesson[],                                                              // discipline set, module null
}
```

Within a module and within Unfiled, lessons order by `library_rank` (nulls
last), then id. `LibraryLesson` gains `disciplineModuleId: number | null` so
the optimistic updater and the drop resolver can tell where a lesson sits
without searching. The org-level `untitled` list is unchanged.

`libraryDisciplineSchema.lessons` — the flat list — is **removed**, not kept
beside the grouped shape: two answers to "which lessons are in this
discipline" is how the pane and the resolver drift. Every reader that walked
`discipline.lessons` (the library dialog's `findLesson`, the drop resolver,
the optimistic updaters, tests) walks `modules[].lessons` and `unfiled`
instead, through one helper: `disciplineLessons(discipline): LibraryLesson[]`.

## Writes

All in `src/db/discipline-modules.ts`, each guarded by its route with
`requireLessonContentPermission(disciplineId, action)` after the org
ownership check the discipline routes already do (`findDisciplineInOrg`).

| write | guard action | behaviour |
| --- | --- | --- |
| `createDisciplineModule(disciplineId, name)` | `create` | appended at `max(rank)+1` |
| `renameDisciplineModule(id, name)` | `update` | name only; no slug |
| `reorderDisciplineModule(id, prev, next)` | `update` | midpoint rank between neighbours **of the same discipline**; a neighbour from another discipline is a 400 |
| `deleteDisciplineModule(id)` | `delete` | the row; lessons unfiled by the FK |
| `placeLessonInLibrary(lessonId, { disciplineModuleId, prevLessonId, nextLessonId })` | `update` on the **lesson's** discipline | sets module (or null = Unfiled) and a midpoint `library_rank`; module of another discipline → 400 naming both |

The rank arithmetic mirrors `reorderModule` / `movePlacement`: neighbours are
read as scalar subqueries, the row is pinned by id, and a neighbour that is
not where the client thinks it is yields `null` → 404 rather than a stray
write.

After every write the org library query is invalidated on the client; no
learner cache is touched because no learner payload changed.

## API

| route | body | answers |
| --- | --- | --- |
| `POST /api/admin/disciplines/:id/modules` | `{ name }` | 201 the module |
| `PATCH /api/admin/discipline-modules/:id` | `{ name }` **or** `{ prevModuleId, nextModuleId }` | 200 |
| `DELETE /api/admin/discipline-modules/:id` | — | 204 |
| `PATCH /api/admin/lessons/:id/library-placement` | `{ disciplineModuleId: number \| null, prevLessonId, nextLessonId }` | 200 |

The module routes resolve the module's discipline first
(`getDisciplineIdForDisciplineModule`), check org ownership, then guard —
the same ordering the lesson routes use so an unowned id reads as not found.

## Library pane

- A discipline column is an accordion of its modules — the `ModuleAccordionItem`
  shell the course rail uses (name · lesson count · drag handle; rename and
  delete icons) — followed by an **Unfiled** group that is not a module: no
  rename, no delete, no handle, always last, always present (empty reads
  "Nothing unfiled").
- **Add module** joins `DisciplineColumnActions`, with a create dialog
  mirroring the course rail's.
- Controls are offered to everyone the pane admits and the server refuses
  when it must — the pane's existing rule, since router context cannot
  answer per-discipline authority.
- Delete asks for confirmation naming how many lessons will be unfiled (they
  are not deleted; the sentence says so).

### Drag rules (`resolveDrop`, pure)

Library ids stay flat — a lesson has exactly one place in the library:
`library-lesson-<id>` (existing), `library-module-<id>`,
`library-container-<id>`, `library-unfiled-<disciplineId>`. `parseDndId`
learns the three new flat kinds.

| drag | over | result |
| --- | --- | --- |
| library lesson | a module, its container, or a lesson **of its own discipline** | `library-move` `{ lessonId, disciplineModuleId, overId }` |
| library lesson | Unfiled **of its own discipline** | `library-move` with `disciplineModuleId: null` |
| library lesson | anything of **another discipline** | `forbidden`, naming both disciplines and the remedy (lessons stay in their discipline) |
| library lesson | a course module | `link` — **unchanged** |
| library module | a module of the same discipline | `reorder-library-module` `{ disciplineId, moduleId, overModuleId }` |
| library module | anything else | `forbidden` (modules stay in their discipline; not droppable on the rail) |

Optimistic updaters in `editor-board-updates.ts` work on `OrgLibrary`:
`moveLessonInLibrary`, `reorderLibraryModules`, plus `libraryLessonNeighbours`
for the server body. Rollback on error from the drag-start snapshot, as the
rail does.

The accordion open state lives in a sibling atom,
`expandedLibraryModuleIdsAtom`, not in `expandedEditorModuleIdsAtom`:
discipline module ids and course module ids come from different tables and
would collide in one flat list. Same auto-expand-on-hover behaviour.

## Testing

Six groups, red first.

1. **Migration** — the exact DDL handed to the transaction (`set null` on
   the lesson FK, `cascade` on the discipline FK), idempotence on re-run.
2. **Placement writer SQL** — `placeLessonInLibrary` pins one lesson row,
   computes the midpoint from the named neighbours, refuses a module of
   another discipline; `reorderDisciplineModule` scopes neighbours to the
   discipline.
3. **Route guards** — every route asserts *which discipline id* the guard was
   handed (for the placement route: the **lesson's** discipline, not the
   target module's — the bug shape is guarding on the wrong one).
4. **Payload** — grouping by module and Unfiled, module order by rank, lesson
   order by `library_rank` then id, `disciplineModuleId` on each lesson,
   `untitled` untouched.
5. **Drop resolution** — every row of the table above, both accepted and
   refused, including a lesson dragged over a module of another discipline
   and a module dragged onto the course rail.
6. **Components** — the column renders modules then Unfiled; Unfiled has no
   controls; the add-module action reaches its callback; the delete confirm
   names the unfiled count.

## Out of scope

- A lesson in more than one discipline module.
- Any learner-facing use of discipline modules; sequencing or gating on them.
- Moving a lesson between disciplines.
- Filing new lessons straight into a module on creation.
