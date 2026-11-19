# Lesson Card Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin lesson cards give the name its own full-width line, swap the Draft label for an eye toggle, and carry version placeholders (a visible inert "Ver" chip on course cards, an invisible "Vers 3.4" on library cards).

**Architecture:** `LessonCard` (presentational, shared by every course surface) gains an optional `visibility` prop shaped like its existing `remove` prop, and an inert Ver chip beside the quickshot chips. The two live containers that already hold a lesson-config mutation wire `visibility` to it. `LibraryLessonCard` gets the same name line plus an `opacity-0`, `aria-hidden` version line.

**Tech Stack:** React 19, Tailwind (logical properties), Base UI Tooltip via `TooltipIconButton`, lucide-react (`Eye`, `EyeOff`), TanStack Query, vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-19-lesson-card-layout-design.md`

## Global Constraints

- Logical properties only (`ms-`/`me-`/`ps-`/`pe-`, `start`/`end`, `text-start`).
- Colours from existing tokens only; no hex, no Tailwind palette classes. Ver chip: `bg-accent-9 text-accent-contrast` (gold; not `warning-9`, which is ITPS orange).
- Presentational cards stay pure: no hooks, no mutations. Mutations live in containers.
- Every disabled/inert control states why in its accessible name and tooltip.
- Copy, verbatim:
  - visible lesson: `Visible to students. Hide it`
  - draft lesson: `Hidden from students. Show it`
  - in flight: `Updating visibility of {lesson name}…`
  - Ver chip: `Ver: lesson versions are coming soon`
  - library placeholder text: `Vers 3.4`
- Vitest imports use `#/`, not `@/`. Tests stub `ClampedText` and `TooltipIconButton` as the existing card tests do (copy their `vi.mock` blocks).
- Assert on what the consumer received (the mutation's call arguments), not on cache state.

## Review Focus

1. Read-only cards (drag overlay `editor-container.tsx:1355`, `BorrowedLessonList`, `ModuleColumn`) pass no `visibility`: a draft there must still say "Draft" in words, or draft status vanishes from those surfaces.
2. Clicking the eye twice fast: the second click while pending must do nothing (control inert, label says it is updating).
3. The Ver chip sits inside a drag-sortable card: clicking or pressing Enter on it must not call anything or start a drag.
4. A very long name must clamp on its own line and never push the icon row off the card.
5. The invisible `Vers 3.4` must not be announced, focused, or selectable (`aria-hidden`, `select-none`, `pointer-events-none`).

---

### Task 1: `LessonCard` layout, eye toggle, Ver chip

**Files:**
- Modify: `src/components/admin/lesson-card.tsx`
- Test: `src/components/admin/__tests__/lesson-card.test.tsx`

**Interfaces:**
- Produces: new optional prop on `LessonCard`:
  ```ts
  visibility?: { onToggle: () => void; isPending?: boolean };
  ```
  When given, the card renders an eye `TooltipIconButton` as the FIRST icon in the icon row, and no Draft label. When absent, behaviour is today's: a `Draft` label for `!isAvailable`.

Layout (one column beside the video tile):
1. Row 1: `ClampedText` name alone, full width.
2. Row 2: `justify-end` icon row: eye (or Draft label), edit, remove, delete, drag handle.
3. `alsoIn` chip, unchanged.
4. Chip row: `quickshotSlot` then the Ver chip, `flex flex-wrap items-center gap-1.5`. The Ver chip renders only when `quickshotSlot` is given (ghost/overlay cards have no chips).

- [ ] **Step 1: Write failing tests** in `lesson-card.test.tsx` (add the `TooltipIconButton` stub from `editor-lesson-card-actions.test.tsx`):
  - `it('keeps the Draft label on read-only cards')`: `lesson({ isAvailable: false })`, no `visibility` → `getByText('Draft')` present, no button named `/students/`.
  - `it('offers to show a draft lesson')`: `isAvailable: false`, `visibility={{ onToggle }}` → button named `Hidden from students. Show it`; click → `onToggle` called once; `queryByText('Draft')` null.
  - `it('offers to hide a visible lesson')`: `isAvailable: true` → button named `Visible to students. Hide it`.
  - `it('goes inert while the visibility change is saving')`: `isPending: true` → button named `Updating visibility of Crosswind landings…`; click → `onToggle` not called.
  - `it('shows an inert Ver chip beside the quickshot chips')`: with `quickshotSlot={<span>chips</span>}` → element named `Ver: lesson versions are coming soon` present; clicking it throws nothing and no other prop callback (`onEdit`, `onPlay`, `onToggle`) is called.
  - `it('draws no Ver chip on a card without chips')`: no `quickshotSlot` → no element named `Ver: lesson versions are coming soon`.
- [ ] **Step 2: Run, confirm the new tests fail**
  Run: `npx vitest run src/components/admin/__tests__/lesson-card.test.tsx`
  Expected: the six new tests FAIL; existing ones pass.
- [ ] **Step 3: Implement.** Eye: `EyeOff` when draft, `Eye` when visible, `h-4 w-4`, `aria-hidden` on the icon. `TooltipIconButton` `label` per the copy above, `disabled={visibility.isPending}`. The draft-state eye carries a tint class so it stays noticeable (`text-warning-text`; the button's own hover classes still apply). Ver chip: `TooltipIconButton`-style trigger is NOT used (it's an icon button); render `<Tooltip>` from Base UI around a `<button type="button" aria-disabled="true" aria-label="Ver: lesson versions are coming soon">` with `chipClassName` shape and `bg-accent-9 text-accent-contrast`, no `onClick`, reading `Ver`. Reuse `IconButtonTooltip` from `#/components/ui/tooltip-icon-button` for the popup, as `lesson-quickshot.tsx` does for its chips. Add a doc comment on the chip: placeholder until lesson versioning exists (see spec).
- [ ] **Step 4: Run tests, confirm pass**
  Run: `npx vitest run src/components/admin/__tests__/lesson-card.test.tsx`
  Expected: all PASS.
- [ ] **Step 5: Commit** `feat(admin): lesson card name gets its own line; eye toggle; Ver placeholder`

### Task 2: Wire the eye toggle in both live course surfaces

**Files:**
- Modify: `src/components/admin/editor-lesson-card-container.tsx` (knowledge editor, the screen in the user's screenshot)
- Modify: `src/components/admin/sortable-lesson-card.tsx` (per-course board)
- Test: `src/components/admin/__tests__/editor-lesson-card-actions.test.tsx`, `src/components/admin/__tests__/sortable-lesson-card.test.tsx`

**Interfaces:**
- Consumes: `LessonCard`'s `visibility` prop (Task 1).
- Editor: `useUpdateEditorLessonConfig()` from `#/data-hooks/use-update-editor-lesson-config` (the hook its quickshot chips already use). Board: `useUpdateLessonConfig(courseId)` from `#/data-hooks/use-update-lesson-config`. Both take `{ lessonId, patch: UpdateLessonConfigInput }`.

- [ ] **Step 1: Write failing tests.** In each file, mock the container's hook to return `{ mutate, isPending: false }` with `mutate = vi.fn()`, then:
  - `it('hides a visible lesson through the config mutation')`: lesson `isAvailable: true`, click `Visible to students. Hide it` → `expect(mutate.mock.calls[0][0]).toEqual({ lessonId: 1, patch: { isAvailable: false } })` (use the fixture's id).
  - `it('shows a draft lesson through the config mutation')`: `isAvailable: false` → patch `{ isAvailable: true }`.
  - `it('passes the in-flight state to the eye')`: hook `isPending: true` → button named `Updating visibility of <name>…` present.
  If a file already mocks the hook for the quickshot, reuse that mock's `mutate` rather than adding a second mock.
- [ ] **Step 2: Run, confirm fail**
  Run: `npx vitest run src/components/admin/__tests__/editor-lesson-card-actions.test.tsx src/components/admin/__tests__/sortable-lesson-card.test.tsx`
  Expected: new tests FAIL.
- [ ] **Step 3: Implement.** In each container call the hook once and pass `visibility={{ onToggle: () => mutate({ lessonId: lesson.id, patch: { isAvailable: !lesson.isAvailable } }), isPending }}`. Errors are already toasted and rolled back inside both hooks; add nothing.
- [ ] **Step 4: Run, confirm pass** (same command). Expected: all PASS.
- [ ] **Step 5: Commit** `feat(admin): eye toggle publishes or drafts a lesson from the card`

### Task 3: `LibraryLessonCard` name line and hidden version placeholder

**Files:**
- Modify: `src/components/admin/library-lesson-card.tsx`
- Test: `src/components/admin/__tests__/library-lesson-card.test.tsx`

Layout: row 1 the name alone, full width. Row 2: the `Vers 3.4` placeholder at start, then (pushed to end with `ms-auto` or `justify-between`) the existing Draft label, delete, and drag handle. No eye here (spec: library card gets the name line and placeholder only).

- [ ] **Step 1: Write failing tests:**
  - `it('reserves an invisible, unannounced spot for the version')`: `getByText('Vers 3.4')` has class `opacity-0` and `closest('[aria-hidden="true"]')` is not null.
  - Existing `'gives the name the width the badge used to take'` must still pass unchanged.
- [ ] **Step 2: Run, confirm fail**
  Run: `npx vitest run src/components/admin/__tests__/library-lesson-card.test.tsx`
- [ ] **Step 3: Implement.** Placeholder: `<span aria-hidden="true" className="select-none pointer-events-none opacity-0 text-xs text-tertiary">Vers 3.4</span>` with a comment: invisible on purpose (user's call, 2026-11-19) until lesson versioning exists; replace with the real version then.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit** `feat(admin): library card name gets its own line; hidden version placeholder`

### Task 4: Whole-suite check and browser look

- [ ] **Step 1:** `npx tsc --noEmit -p .` → 0 errors.
- [ ] **Step 2:** `npx vitest run` → all files pass.
- [ ] **Step 3:** `npx biome check src/components/admin` → no errors (never `biome format --write src`).
- [ ] **Step 4:** Dev server on port 5001: open the knowledge editor, confirm on a course card: full-width name, icons on row 2, the eye's label matches each lesson's state (do NOT click it: localhost's database is production, and flipping a real lesson hides it from students; the mutation is covered by Task 2's tests), Ver chip shows its tooltip and does nothing; library card shows no visible version text. Screenshot both cards.
