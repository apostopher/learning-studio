# Lesson Config tab (Availability / Access / Debrief) — design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan

## Summary

Collapse the lesson-config modal's five tabs down to three — **Video · Material ·
Config** — and turn the currently-placeholder Availability / Access / Debrief
tabs into three live setting rows grouped under a single **Config** tab. Each row
shows a title + description on the inline-start and a two-option toggle
(Base UI `ToggleGroup`, single-select) on the inline-end. Toggles auto-save on
change, matching the existing auto-persist pattern of the Video and Material tabs
(the modal has no global save button).

No database migration is required: the three backing columns
(`lessons.is_available`, `lessons.has_debrief`, `lessons.required_subscriptions`)
already exist. The work is threading two of them through the board query,
extending the lesson PATCH endpoint, and building the presentational + container
UI.

## The three controls

| Row | Options | Backing column | Mapping |
|---|---|---|---|
| Availability | Public / Private | `is_available` (bool) | Public = `true`, Private = `false` |
| Access | Free / Subscription | `required_subscriptions` (text[]) | Free = `[]`; Subscription = inherit parent module's `required_subscriptions` |
| Debrief | On / Off | `has_debrief` (bool) | On = `true`, Off = `false` |

Displayed Access state is **Subscription** when the lesson's array is non-empty,
otherwise **Free**.

## Decisions

- **Access = inherit module.** Switching a lesson to *Subscription* copies the
  parent module's `required_subscriptions` array onto the lesson; *Free* clears
  it. The toggle stays binary — no per-lesson tier picker.
- **Module-is-free edge case.** If the parent module itself has an empty
  `required_subscriptions` (the module is Free), there is nothing to inherit, so
  the **Subscription option is disabled** with a hint:
  *"This module is free — set the module's access first."* This avoids a silent
  no-op where the toggle appears to flip but persists nothing.
- **Auto-save, optimistic.** Each toggle fires a PATCH immediately. The mutation
  optimistically patches the matching lesson in the `courseBoard` query cache so
  the toggle flips instantly; on error it rolls back and surfaces an error toast
  (`"Couldn't update setting"`). A plain invalidate-only hook would lag behind
  the refetch and make the toggle feel unresponsive.
- **No migration.** All three columns already exist with sensible defaults
  (`is_available=false`, `has_debrief=true`, `required_subscriptions=[]`).

## Backend

### Board query — `getCourseBoard` (`src/db/admin.ts`)
Add to the selected columns and the mapped output:
- lessons: `has_debrief`, `required_subscriptions`
- modules: `required_subscriptions` (so a lesson can read what it would inherit)

### Schemas (`src/lib/admin-schemas.ts`)
- `boardLessonSchema` — add `hasDebrief: z.boolean()` and
  `requiredSubscriptions: SubscriptionsSchema`.
- `boardModuleSchema` — add `requiredSubscriptions: SubscriptionsSchema`.
- New `updateLessonConfigInputSchema` — a `.strict()` object with all-optional
  `isAvailable` / `hasDebrief` / `requiredSubscriptions`, refined to require at
  least one key present. `.strict()` + disjoint key sets keep it from colliding
  with the rename (`{ name }`) and move (`{ targetModuleId, … }`) bodies.

### DB helper — `updateLessonConfig(lessonId, patch)` (`src/db/admin.ts`)
Mirrors `updateLessonName`: `.set({ ...patch, updatedAt: sql\`now()\` })` where the
lesson id matches, `.returning(...)` the affected config fields (or `null` when
no row matched).

### Endpoint — `PATCH /api/admin/lessons/$lessonId` (`src/routes/api/admin/lessons.$lessonId.ts`)
Add a third parse branch after the existing rename and move branches: parse the
body with `updateLessonConfigInputSchema`; on success call `updateLessonConfig`
and return the updated row (404 when the lesson doesn't exist). Existing branches
are untouched.

## Data hook — `useUpdateLessonConfig(courseId)` (`src/data-hooks/use-update-lesson-config.ts`)

TanStack Query mutation PATCHing the endpoint. Optimistic lifecycle:
- `onMutate` — cancel in-flight `courseBoard(courseId)` queries, snapshot the
  cache, and patch the target lesson (found by id across `modules[].lessons`)
  with the new field(s).
- `onError` — restore the snapshot and toast `"Couldn't update setting"`.
- `onSettled` — invalidate `courseBoard(courseId)`.

## Frontend components

Presentational-first, kebab-case filenames, built on Base UI.

- **`binary-toggle.tsx` → `BinaryToggle`** (presentational). Wraps Base UI
  `ToggleGroup` in single-select mode with exactly two `Toggle` items. Props:
  `value`, `onValueChange(next)`, `options: { value; label }[]`, optional
  `disabledValue` + `disabledHint`. Active item styled with the `apple-9` accent;
  theme-aware; logical properties throughout. Guards against
  `ToggleGroup` emitting an empty selection (single-select can deselect) — ignore
  a change that clears the value so a control can't enter a no-value state.
- **`config-setting-row.tsx` → `ConfigSettingRow`** (presentational). Pure
  layout: `title`, `description`, `children` (the control). Text block at
  inline-start, control at inline-end, aligned across rows.
- **`config-section-container.tsx` → `ConfigSectionContainer`** (container).
  Props: `courseId`, `lesson: BoardLesson`, `module: BoardModule`. Derives each
  toggle's current value from the lesson, wires `onValueChange` to
  `useUpdateLessonConfig`, and applies the Access mapping (including the
  module-is-free disable + hint).

## Modal wiring

- **`lesson-config-dialog-container.tsx`** — accept `modules: BoardModule[]`
  instead of the flattened `lessons`. Find the active lesson and its parent
  module from `modules`. Replace the three `PLACEHOLDER_SECTIONS` with a single
  `{ value: 'config', title: 'Config', content: <ConfigSectionContainer … /> }`.
  Video and Material sections are unchanged.
- **`module-board-container.tsx`** — mount with `modules={modules}` (drop the
  `modules.flatMap((m) => m.lessons)`).

## Testing

- **Endpoint** — config branch accepts each field individually; rejects an empty
  object and unknown keys; rename/move branches still work.
- **`updateLessonConfig`** — persists each field; returns `null` for a missing
  lesson.
- **`useUpdateLessonConfig`** — optimistic cache patch applies, rolls back on
  error. (Follow the repo's vitest conventions: `#/` alias, `vi.hoisted` mocks,
  no `importOriginal` of internal modules.)
- **`BinaryToggle`** — renders both options, calls `onValueChange` with the
  chosen value, ignores an empty-selection change, respects `disabledValue`.
- **`ConfigSettingRow`** — renders title/description/control.
- **`ConfigSectionContainer`** — Access shows Subscription when the array is
  non-empty; selecting Subscription inherits the module's array; the Subscription
  option is disabled when the module is Free.

## Out of scope

- Per-lesson subscription-tier picking (Access stays a binary inherit).
- Any change to how `required_subscriptions` gates student playback.
- Editing module-level subscriptions from the lesson dialog.
