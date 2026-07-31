# Shared understanding: module dependencies admin UI

## Goal

`module_dependencies` has been in the database and enforced by `evaluateLessonLock`
since the gating work, but nothing in `/admin/$courseId/editor` can read or write
it — the only way to sequence modules today is a manual SQL insert. Add a
**Dependencies** section to the course edit modal that edits the whole course's
module prerequisite graph, end to end: board query → zod schema → PATCH branch →
data hook → UI.

Note on the original framing: `edit-course-dialog-container.tsx` **already** uses
`SectionedConfigModal` (Basic info / Video providers / Onboarding). No conversion
is needed — this adds a fourth section to the shell that is already there.

## Decisions

| #   | Decision                                | Chosen                                                                                                                                 | Rationale                                                                                                                                                                        |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Where dependency editing lives          | New **Dependencies** section in the course edit modal, listing every module in rank order                                                | Prerequisites are only meaningful relative to sibling modules; per-module editing can never show the graph being built, so cycles stay invisible until a learner is stuck           |
| 2   | Save model                              | **Auto-save per module** — one `PATCH /api/admin/modules/$moduleId` per changed module, optimistic, toast on failure                     | Matches the three sibling sections, none of which have a Save button; `SectionedConfigModal`'s doc comment says callers own their own save behavior                                 |
| 3   | Cycle handling                          | **Prevent in the picker, reject on the server** — cycle-forming options render disabled with a reason; PATCH re-reads siblings, DFS, 409 | A cycle deadlocks both modules permanently with zero admin-visible signal; unrecoverable by the learner, so it must be impossible to enter. Two tabs can each add a legal-but-jointly-cyclic edge, so the client cannot be the only check |
| 4   | Control shape                           | One row per module, multi-select `Combobox` with removable chips (Base UI 1.4.1 ships `Chips`/`Chip`/`ChipRemove`)                       | Reuses the Config tab's row idiom, reads in the order learners meet the modules, type-to-filter stays usable at 30 modules. A checkbox matrix is O(n²) cells and hostile to screen readers |
| 5   | Dangling prerequisite slugs             | **Clean up on delete, tolerate on read** — `deleteModule` strips its slug from siblings; the section filters unknown slugs at render     | `depends_on` is `text[]` with no FK, so deleting a module orphans every reference to it. A phantom chip implies a gate that does not exist; the render filter also covers rows already in the DB |
| 6   | Prerequisites that cannot gate anything | **Warn, don't block** — `moduleGateWarning()` pure fn beside `videoWatchWarning`, surfaced via `ConfigSettingRow`'s `warning` prop        | Wiring the graph before videos exist is normal mid-authoring, so blocking is unusable; but a permanently inert gate has no other detection path in the system                       |
| 7   | Learner locked out mid-course           | **Accept, no grandfathering**, and show a learner-progress count per module                                                              | Grandfathering means per-learner exemption state — a second source of truth for locks, which is the exact split-brain `lesson-gating.ts` exists to prevent. Lockout is recoverable; split-brain is not |
| 8   | How the learner count is surfaced       | **Passive** — count sits in the row description, visible while choosing chips. No confirm step                                           | A confirm dialog on every edit fights the auto-save model and gets click-through-ignored by the third one                                                                          |

## Failure behaviour

| Scenario                                                        | What happens                                                                                                          | User sees                                                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Admin picks a module that would form a loop                     | Option is disabled before it can be chosen; no request is made                                                        | Disabled row: _"Would create a loop — Airspace already requires this module."_                                                 |
| Stale client sends a cyclic edge anyway (two tabs)              | Server re-reads the course's other edges, runs the same DFS, returns **409**; optimistic update rolls back, board refetches | Toast: _"That would create a loop — someone else may have changed dependencies. Reopening with the latest."_                    |
| PATCH fails for any other reason                                | `onError` restores the previous board cache (mirrors `useUpdateLessonConfig`)                                          | Toast: _"Couldn't update dependencies"_; chips revert                                                                          |
| Three chips added in fast succession                            | Mutations serialized via TanStack `scope: { id: 'module-deps-<moduleId>' }`, so a stale full-array write cannot land last | Nothing — chips settle in the order clicked                                                                                    |
| A depended-on module is deleted                                 | `deleteModule` strips the slug from every sibling's `depends_on` in the same transaction                               | The chip is gone next render; no phantom                                                                                       |
| Pre-existing orphan slug already in the DB                      | Render filters slugs not present in the course's modules; gating already ignores them (`if (!prereq) continue`)        | Nothing — the orphan is simply absent                                                                                          |
| Prerequisite module has no lessons                              | Saved and allowed; `.every()` on an empty list is true, so it never blocks                                            | Warning: _"Airspace Basics has no lessons yet, so this prerequisite won't lock anything until it does."_                        |
| Prerequisite module's lessons all skip video watch              | Saved and allowed; `isLessonSatisfied` returns true for all of them                                                   | Warning: _"No lesson in Airspace Basics requires a video watch, so this prerequisite can never block."_                         |
| Course has 0 or 1 module                                        | Section renders its empty state; nothing can be a prerequisite of anything                                            | _"Add a second module before you can sequence them."_                                                                          |
| Dependency edited while learners hold progress                  | Saved immediately; affected learners lock on next load                                                                | Row description carries _"12 learners have progress here"_ before the edit is made                                             |
| Write succeeds but Redis `course-details` is stale              | `updateModuleDependencies` calls `invalidateCourseDetailsCache(await getCourseSlugForModuleId(id))`, as `updateModule` already does | Nothing — learner locks reflect the edit on next request                                                                       |

## Accepted risks

- A learner mid-module is locked out the moment a prerequisite is added, with no grandfathering and no notification to them. Recoverable by finishing the prerequisite or by the admin removing the edge. (Decision 7.)
- Deleting a module that others depend on gets no extra confirmation; the existing delete dialog stands unchanged. The dependency cleanup is silent.
- Cross-course dependencies remain expressible in the raw column (`depends_on` is unscoped `text[]`) but are inert — `evaluateLessonLock` only searches `course.modules`. The picker will not offer them; no migration cleans up any that exist.
- Redis `course-details` has a TTL window during which a concurrent read can serve pre-edit locks. Same exposure every other admin mutation already has.

## Assumed (not confirmed)

- Decision 6 uses the **two-case wording** (no lessons vs no watchable lessons), matching how `videoWatchWarning` distinguishes its two cases, rather than a single combined string.
- The section container calls `useCourseBoard(courseId)` itself rather than threading `modules` down from `CourseActionsContainer` — same query key, already cached, no extra fetch. `EditCourseDialogContainer` takes no props today and this keeps it that way.
- `boardModuleSchema` gains `dependsOn: z.array(z.string())`, populated by a left join on `module_dependencies` in `getCourseBoard`.
- The learner count is a distinct-`userId` count off `videos_progress`, joined with the `::text` cast that `getMyCourses` already documents (`lessons.video_id` is uuid, `videos_progress.video_id` is text), restricted to `watchedMilestones`.
- A module cannot depend on itself; self is excluded from its own picker.
- `ConfigSettingRow` is `flex items-center justify-between` with a `shrink-0` control built for a small `BinaryToggle`. A chip combobox grows; the row needs a variant that lets the control column expand rather than a new component.
- Tests, per the house rule that a value must be asserted at its consumer: the cycle DFS and `moduleGateWarning` get pure unit tests; the PATCH branch gets a route test asserting the 409 body; the data hook gets a test asserting the **fetch body** contains the full new array, not that an atom holds it. Each is confirmed red before the fix lands.

## Out of scope

- **Lesson-level dependencies** (`lesson_dependencies`, `{moduleSlug?, lessonSlug}` jsonb) — same missing-UI problem, strictly larger. Brought back in once module deps are in use and the picker pattern has proven out.
- **Converting `edit-module-dialog-container` to `SectionedConfigModal`** — would be needed if per-module dependency editing were ever wanted alongside the course-level graph.
- Any change to gating semantics in `lesson-gating.ts`.
- A graph/DAG visualisation of the dependency tree.

## Open

| Deferred                                              | Trigger that forces it                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Transitive-cycle UX beyond disabling the option        | First time an admin reports not understanding why an option is unavailable                        |
| Backfill migration stripping orphaned slugs from `depends_on` | A consumer other than this UI starts reading the raw column                                  |
| Blocking confirm instead of a passive count            | These courses acquiring live paying learners on partially-completed modules                       |
