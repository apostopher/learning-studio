# Shared understanding: lesson sequencing

## Goal

Give admins a UI for lesson prerequisites. The overwhelmingly common case —
"lessons run in order" — becomes one toggle per module, derived from rank
rather than stored as edges. Arbitrary per-lesson graphs stay available behind
it.

## What already exists

- `lesson_dependencies`: one row per lesson (`lesson_id` is `.unique()`),
  `depends_on` is JSONB `{ lessonSlug, moduleSlug? }[]`. Cross-module lesson
  prerequisites already work in `evaluateLessonLock`.
- `moduleDependenciesContainer` + `ModuleDependencyPicker` + the
  `cyclicPrerequisites` / `moduleGateWarning` predicates, for MODULES only.
- **Nothing for lessons.** `BoardLesson` has no dependency field, the board
  query never reads the table, there is no cycle protection, no cleanup on
  delete, and no inert-gate warning.

## Decisions

| #   | Decision | Chosen | Rationale |
| --- | -------- | ------ | --------- |
| D1  | Stored edges or derived order? | **Derived** — a per-module `sequentialLessons` flag expanded at gate time | `moveLesson` reorders lessons AND moves them between modules. Stored edges encode the order at the time they were written, so after a drag the gate enforces a sequence the admin can no longer see. A derived chain follows `rank` and is correct by construction after every move |
| D2  | Where does expansion happen? | Inside `evaluateLessonLock` | That file is the single source of truth the server enforces and the client explains. A chain expanded in `toGateCourse` or baked into the payload is a fourth prerequisite rule living outside it — the drift its header warns about |
| D3  | What does the chain point at? | The nearest **preceding lesson that can block** — skipping unavailable, video-optional and video-less lessons | `isLessonSatisfied` returns true unconditionally for a lesson with no video, so an immediate-predecessor chain does not merely have holes, it **leaks**: a learner who has watched nothing opens the lesson after a video-less one. See below |
| D4  | Explicit edges vs the chain | Explicit edges **override** the chain for that lesson | Additive cannot express "this one is off the chain", so it is strictly less expressive. An alternative-path lesson is a real case |
| D5  | Keeping the graph acyclic | At expansion, **ignore any override edge pointing at a later lesson** (module rank, then lesson rank) | Every surviving edge points strictly backwards, so a cycle is impossible by construction — no detection, no traversal, no `cyclicPrerequisites` equivalent. Write-time rejection (what modules do) cannot catch the reorder case at all |
| D6  | Where the UI lives | A new **"Lesson sequencing"** tab in the course dialog: collapsible per module, one toggle each, every lesson showing its computed prerequisite and an Override affordance | Module order stays in its own tab. D3 makes the chain skip lessons, so the computed result must be on screen — an invisible skip is the same defect `moduleGateWarning` exists to catch |
| D7  | Prerequisite lookup | Resolve by **`lessonSlug` alone**; `moduleSlug` stops being load-bearing | `lessons.slug` is globally UNIQUE, so the module component is redundant — and harmful: today `evaluateLessonLock` finds the module first, so moving either lesson across modules makes the edge resolve to nothing and the gate vanish silently |
| D8  | `sequentialLessons` default | **`true`**, no backfill | It is the stated 99%. Defaulting false ships a feature that does nothing until toggled once per module, and the module someone forgets is silently unsequenced |
| D9  | Chain scope | **Within-module only.** The first lesson of a module has no chain prerequisite | Cross-module sequencing is exactly what module dependencies already are; chaining across the boundary double-gates the same thing |
| D10 | Override picker contents | Only lessons that come **earlier** | Not the safety mechanism — D5 is — but it stops the common path creating an edge that is dead the moment it is saved |

## The leak D3 closes

`isLessonSatisfied` (`lesson-gating.ts:87-90`) returns `true` for any lesson
that is unavailable, has `needsVideoWatch: false`, or has no video. The file
justifies walking only direct edges like this:

> a locked lesson is unplayable, so its video cannot be watched, so its
> dependents stay locked

That fails on a video-less lesson, which is satisfied whether or not it is
itself locked. In a chain `1 → 2 → 3 → 4 → 5` where lesson 4 has no video,
lesson 5 opens for a learner who has watched nothing at all. This is live
TODAY for hand-written lesson dependencies; the chain would only make it
systematic. ~20 of the iTPS course's 102 lessons have no video, and yesterday's
progress work makes video-less lessons a normal, completable thing.

## Implementation surface

- **Schema:** `modules.sequential_lessons boolean not null default true`.
- **Cache key bump REQUIRED: `course-details-v2` → `v3`.** Unlike `hasDebrief`
  yesterday, this is a genuinely new column: entries cached before it existed
  deserialise without it, so `sequentialLessons` reads as `undefined` → falsy →
  the chain silently off for up to the 6h TTL. This is precisely the failure
  the comment at `course.ts:174` documents.
- **Gate:** `GateModule` gains `sequentialLessons`; `evaluateLessonLock` gains
  chain expansion (D3), forward-edge dropping (D5) and slug-only lookup (D7).
  `lesson-gating-inputs.ts` and `course-details-shape.ts` gain the field.
- **Board:** `BoardModule` gains `sequentialLessons`; `BoardLesson` gains
  `dependsOn`; the board query joins `lesson_dependencies`.
- **Writes:** a per-lesson dependency mutation (upsert, delete-when-empty —
  same shape as `updateModuleDependencies`) and a module-flag mutation.
- **`deleteLesson` must strip the deleted slug from every dependent's
  `depends_on`** — `deleteModule` already does this with `array_remove`;
  JSONB needs a `jsonb_agg` filter. Nothing cleans up today.
- **UI:** the new tab, its container, and a lesson picker (the existing
  `ModuleDependencyPicker` is slug-keyed and reusable nearly as-is).

## Failure behaviour

| Scenario | What happens | Admin sees |
| -------- | ------------ | ---------- |
| Every earlier lesson is video-less | No chain prerequisite; the lesson opens | "nothing before it can gate" on the row |
| Override points at a later lesson (after a drag) | Edge ignored at expansion; still stored | "after: X — currently ignored, X now comes later" |
| Prerequisite lesson deleted | Stripped from dependents on delete; any survivor is skipped by the gate | Chip gone |
| Lesson moved to another module | Chain re-derives from new rank; overrides still resolve (D7) | Updated chain |
| Module has 0 or 1 lessons | Chain is empty | Toggle present but inert |
| Flag toggled off | Chain gone, overrides retained | Rows show only explicit edges |
| Write fails | Optimistic + serialized per row, as the module tab does | Row reverts |

## Accepted risks

- **A forward-pointing override does nothing until the order changes back.**
  A real inert gate — but stated on the row, unlike today's invisible ones.
- **The chain skips lessons.** A learner can open a reading-only lesson out of
  order. Deliberate: gating on the new completion percent instead would make
  progress depend on a client-reported tab tap, so a dropped
  `POST /api/user/lesson-section` could lock someone out of the rest of a
  course with no way to tell why.
- **`sequentialLessons: true` changes gating for every existing module on
  deploy.** No learners exist yet, so the blast radius is nil today.

## Out of scope

- Changing `isLessonSatisfied` — what *satisfies* a prerequisite is unchanged.
- The module-dependency UI.
- Gating on lesson completion rather than video watched (D1 of the
  2026-08-01 ledger stands).

## Open

| Deferred | Trigger |
| -------- | ------- |
| No inert-gate warning for an override whose target can never block (the lesson equivalent of `moduleGateWarning`) | An admin reports a prerequisite that does nothing |
| `moveLesson` does not warn that a drag changed the effective chain | An admin is surprised by a sequencing change after reordering |
