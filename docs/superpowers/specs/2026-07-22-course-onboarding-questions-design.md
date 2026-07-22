# Course Onboarding Questions (edit-course section)

**Date:** 2026-07-22
**Status:** Approved design, pending implementation plan

## Goal

Add an **Onboarding** section to the edit-course dialog (`EditCourseDialogContainer`,
which renders `SectionedConfigModal`). It lets an admin author a course's user-
onboarding questions: each question is a plain-text auto-expanding textarea, the
admin can add/remove questions and **drag to reorder** them, and a dedicated
**Save** button persists the whole ordered list.

## Resolved decisions

- **Storage:** a `onboardingQuestions` JSONB column on `courses` — an ordered
  array of `{ id: string; text: string }`. Order = array order; `id` (a uuid) is
  for stable React keys + drag identity.
- **Question shape:** plain text only (no answer type).
- **Save:** the section owns its persistence — an own **Save** button + a
  dedicated route, independent of the course "Save changes" (mirrors the
  Video-providers section).
- **Reorder:** dnd-kit (already in the repo), array-move semantics.

## Scope

Admin-side authoring only. The end-user answering flow (showing these questions
to learners, storing answers) is out of scope.

## Architecture & files

Follows repo conventions: independent section container (like
`CourseVideoIntegrationsContainer`) using hooks + react-hook-form; presentational
pieces build on Base UI / dnd-kit; `#/` in tested source + tests, `@/` in the
untested edit-course container; gray/red/`apple-9` tokens; logical CSS.

### Data (modified)

- `src/db/schema.ts` — add to `coursesTable`:
  `onboardingQuestions: jsonb("onboarding_questions").$type<z.infer<typeof OnboardingQuestionsSchema>>().notNull().default([])`.
  Apply via `db:push` (new nullable-default column; safe on existing rows).
- `src/types.ts` (or `@/lib/admin-schemas`) — `OnboardingQuestionsSchema = z.array(z.object({ id: z.string().min(1), text: z.string() }))` and `OnboardingQuestion` type.

### DB (`src/db/admin.ts`)

- `getCourseOnboarding(courseId: number): Promise<OnboardingQuestion[]>` — select the column.
- `updateCourseOnboarding(courseId: number, questions: OnboardingQuestion[]): Promise<OnboardingQuestion[]>` — update + `updatedAt`, return saved.

### API route (new)

- `src/routes/api/admin/courses.$courseId.onboarding.ts` — admin-guarded
  (`requireAdmin` → 403), `parseCourseId` (400 on bad id):
  - `GET` → `getCourseOnboarding(courseId)` → `OnboardingQuestion[]`.
  - `PUT` → body `{ questions: OnboardingQuestion[] }` (zod-validated; 400 on bad
    JSON / parse fail) → `updateCourseOnboarding` → saved array. (PUT = full
    replace, matching the credentials sub-route.)

### Data-hooks (`src/data-hooks/`) + `keys.ts`

- `dataKeys.courseOnboarding(courseId)`.
- `use-course-onboarding.ts` — `useCourseOnboarding(courseId)`: `useQuery` GET,
  zod-parse, `staleTime: 30_000`.
- `use-update-course-onboarding.ts` — `useUpdateCourseOnboarding(courseId)`:
  `useMutation` PUT `{ questions }`, invalidates `courseOnboarding(courseId)`.

### UI components (`src/components/admin/`)

- `course-onboarding-container.tsx` — `CourseOnboardingContainer({ courseId })`.
  Uses hooks (→ NOT render-tested per repo constraint). `useCourseOnboarding` seeds
  a react-hook-form `useForm({ values: { questions } })` + `useFieldArray({ name: 'questions' })`.
  Owns: **Add question** (`append({ id: crypto.randomUUID(), text: '' })`),
  **remove** (`remove(index)`), **reorder** (dnd-kit `onDragEnd` → `move(oldIndex, newIndex)`),
  **Save** (`handleSubmit` → `useUpdateCourseOnboarding`, toast, disabled when not dirty/pending),
  and the DndContext (PointerSensor distance 5 + KeyboardSensor, `closestCenter`).
  Renders `OnboardingQuestionsEditor`.
- `onboarding-questions-editor.tsx` — `OnboardingQuestionsEditor` (presentational):
  `SortableContext` (verticalListSortingStrategy) over the question ids, the list of
  `SortableOnboardingQuestion` rows, an empty state, "Add question" button, Save
  button. Uses dnd-kit `SortableContext` (a hook context) → not render-tested.
- `sortable-onboarding-question.tsx` — `SortableOnboardingQuestion` (one row):
  `useSortable({ id })` → drag handle (`GripVertical`), the auto-expanding textarea
  (registered field), remove (trash) button. Uses `useSortable` → not render-tested.
- Auto-expanding textarea: a styled `<textarea>` with Tailwind `field-sizing-content`
  (Base UI has no auto-grow textarea primitive). Matches the app's input styling.

### Section wiring (modified)

- `src/components/admin/edit-course-dialog-container.tsx` — add a third `sections`
  entry: `{ value: 'onboarding', title: 'Onboarding', content: target && <CourseOnboardingContainer courseId={target.id} /> }`.

## UX & states

- Loading (query pending) → spinner/skeleton; empty (no questions) → an empty note
  above the "Add question" button.
- "Add question" appends an empty auto-growing textarea (focused).
- Each row: drag handle (left), textarea (grows with content), remove trash (right).
- Drag to reorder; Save persists the whole array; success toast; Save disabled
  until dirty. Server error → inline message + toast.

## Testing

dnd/RHF components aren't render-testable in this repo (react-compiler+Vitest hook-
dispatcher constraint), so coverage lands on:
- `OnboardingQuestionsSchema` (zod: accepts valid, rejects missing id/text).
- API handler (`courses.$courseId.onboarding.test.ts`): 403 unauth; 400 bad id /
  bad JSON / bad body; GET returns; PUT validates + calls `updateCourseOnboarding`
  and returns saved — mocking `requireAdmin` + the DB fns (`#/` alias, `vi.hoisted`).
- Data hooks (`use-course-onboarding` GET url + parse; `use-update-course-onboarding`
  PUT payload + invalidate) — mock `fetch`.
- A pure helper if extracted (e.g. `createEmptyQuestion()`); tests use plain
  assertions (no `@testing-library/jest-dom`).
- The container / editor / sortable row are wired but not render-tested (repo convention).

## Out of scope

- Learner-facing onboarding (displaying questions, collecting answers).
- Per-question answer types / options (explicitly dropped).
- Autosave (an explicit Save button was chosen).
