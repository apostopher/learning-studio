# Course Training-Documents UI (AI-training modal)

**Date:** 2026-07-21
**Status:** Approved design, pending implementation plan

## Goal

Add an "AI training" icon-only button to the course action toolbar
(`CourseActionsContainer`). It opens a modal (single scrolling column, at the
lesson-editor's height) where an admin uploads a PDF or Word document for that
course; the file goes to Vercel Blob via `/api/admin/uploads`, then
`/api/ai-rag` (already built) chunks + embeds it scoped to the course. Below the
uploader, a "Training Documents" list shows each source with its embedding
count and a delete control. Reference: the old repo's screen (upload card +
document list).

## Resolved decisions

- **Modal layout:** new single-column scrolling modal, `85vh` tall,
  `max-w-[720px]` (not the lesson editor's 1280px tabbed shell).
- **Document Name:** optional. If provided, it's the document identifier;
  if blank, the uploaded file's name is used.
- **Upload cap:** 50 MB for training docs (images stay at 8 MB).
- **Icon:** lucide `BrainCircuit`.
- **Delete:** inline trash with a confirmation step (embeddings are costly to
  regenerate; matches the app's destructive-action convention).

## Scope / course scoping

Everything is scoped to `course.id`. The list (`GET /api/ai-rag?courseId=`)
returns only that course's docs, so the 6248 migrated org-wide rows
(`course_id NULL`) never appear here. A fresh course starts empty.

## Architecture & files

Follows repo conventions: presentational components (pure, Base UI) + a
container that reads a jotai atom and wires TanStack Query data-hooks; icon
button via `TooltipIconButton`; forms via react-hook-form + zod; colors via
gray/red radix tokens; source uses the `@/` alias (matching sibling
data-hooks/components), tests use `#/`.

### Backend (1 file, modified)

- `src/routes/api/admin/uploads.ts` — in `onBeforeGenerateToken`, branch on the
  upload `pathname`: when it starts with `training-docs/`, return
  `allowedContentTypes: ['application/pdf', DOCX_MIME]` and
  `maximumSizeInBytes: 50 MB`; otherwise keep the existing image mimes at 8 MB.
  `DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'`.
  Keeps image validation untouched.

### State + button (existing files, modified)

- `src/atoms/admin.ts` — add `trainCourseAtom: atom<{ id: number; name: string } | null>(null)`.
- `src/components/admin/course-actions-container.tsx` — add a `BrainCircuit`
  `TooltipIconButton` (label "AI training") that sets `trainCourseAtom`, and
  render `<CourseEmbeddingsDialogContainer />` inline (mirrors Edit/Delete).

### New presentational components (`src/components/admin/`)

- `course-embeddings-modal.tsx` — `CourseEmbeddingsModal`: Base UI `Dialog`
  shell. `Dialog.Backdrop` (bg-gray-1/70 backdrop-blur) + `Dialog.Popup`
  (`fixed inset-0 m-auto h-[85vh] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)]
  max-w-[720px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl
  border border-gray-6 bg-gray-2 shadow-xl`), a header row (title + `X`
  close), and a scrolling body slot (`children`). Props: `open`,
  `onOpenChange`, `title`, `children`.
- `training-doc-upload-card.tsx` — `TrainingDocUploadCard`: the "Upload
  Training Document" card. Dropzone button (hidden `<input type=file
  accept=".pdf,.docx">`), selected-file display, Document Name text input, and
  the "Upload Document" submit button. Pure props: `fileName` (selected),
  `onPickFile(file)`, `docName`, `onDocNameChange`, `onSubmit`, `status`
  (`'idle' | 'uploading' | 'processing'`), `error`, `disabled`.
- `training-docs-list.tsx` — `TrainingDocsList`: the "Training Documents" card
  (title + count, search input, rows, empty state, loading state). Props:
  `docs: {sourcePath, count}[]`, `search`, `onSearchChange`, `onDelete(sourcePath)`,
  `deletingSourcePath`, `isLoading`.
- `training-doc-row.tsx` — `TrainingDocRow`: one row (file icon, `sourcePath`,
  "N embeddings", trash button that asks confirm-then-delete). Props:
  `sourcePath`, `count`, `onDelete`, `isDeleting`.

### Container (new)

- `course-embeddings-dialog-container.tsx` — `CourseEmbeddingsDialogContainer`:
  reads `trainCourseAtom` (open state + `{id, name}`), calls
  `useCourseEmbeddings(courseId)`, `useUploadTrainingDoc()`,
  `useAddEmbeddings(courseId)`, `useDeleteEmbedding(courseId)`. Owns the upload
  form (react-hook-form + zod: optional `docName`, required `file`) and the
  search string (jotai atom `embeddingsSearchAtom`, reset on close).
  Orchestrates upload → embed, maps hook states to the presentational
  `status`/`error`, and renders `CourseEmbeddingsModal` containing
  `TrainingDocUploadCard` + `TrainingDocsList`.

### Data hooks (`src/data-hooks/`) + `keys.ts`

- `dataKeys.courseEmbeddings(courseId: number) => ['admin','course-embeddings', courseId]`.
- `use-course-embeddings.ts` — `useCourseEmbeddings(courseId)`: `useQuery`,
  `GET /api/ai-rag?courseId=${courseId}`, parse with a small zod schema
  (`{ docsBySource: {sourcePath: string, count: number}[] }`), `staleTime: 30_000`.
- `use-upload-training-doc.ts` — `useUploadTrainingDoc()`: `useMutation<{url,fileName,mimeType}, Error, File>`.
  `ext = file.name.split('.').pop()`; `upload('training-docs/${crypto.randomUUID()}.${ext}', file,
  { access:'public', contentType:file.type, handleUploadUrl:'/api/admin/uploads' })`;
  returns `{ url, fileName: file.name, mimeType: file.type }`.
- `use-add-embeddings.ts` — `useAddEmbeddings(courseId)`: `useMutation` posting
  `{ mode:'file', courseId, url, fileName, mimeType }` to `/api/ai-rag`;
  `onSuccess` invalidates `courseEmbeddings(courseId)`.
- `use-delete-embedding.ts` — `useDeleteEmbedding(courseId)`: `useMutation`
  `DELETE /api/ai-rag` with `{ courseId, sourcePath }`; `onSuccess` invalidates
  `courseEmbeddings(courseId)`.

## Data flow

Pick file → `useUploadTrainingDoc` (client-token upload to blob) → with the
returned `{url, mimeType}` and `fileName = docName || file.name`, call
`useAddEmbeddings` → server chunks+embeds (→ `sourcePath = file-<fileName>`) →
invalidate → list refetches. Delete → confirm → `useDeleteEmbedding` →
invalidate.

## API contracts consumed (already implemented)

- `GET /api/ai-rag?courseId=<id>` → `{ docsBySource: {sourcePath, count}[] }`.
- `POST /api/ai-rag` `{ mode:'file', courseId, url, fileName, mimeType }` → `{ success, sourcePath, chunks }`.
- `DELETE /api/ai-rag` `{ courseId, sourcePath }` → `{ success, message }`.
- `POST /api/admin/uploads` — Vercel Blob client-token endpoint (extended for training-docs).

## UX & states

- **Upload button** disabled until a file is selected and while a submit is in
  flight. Two-phase status: **Uploading…** (blob) → **Processing embeddings…**
  (POST /ai-rag). On success: reset file + name, toast/inline success, list
  refreshes. On error: inline error message, form stays.
- **File validation:** accept only `.pdf`/`.docx` (input `accept` + a guard
  mapping extension→mime; reject others with a message).
- **List:** header "Training Documents" + count; search filters `sourcePath`
  client-side (case-insensitive); each row shows count + trash. Loading
  skeleton/spinner while the query is pending; empty state ("No training
  documents yet") when the course has none.
- **Delete:** trash → inline confirm (e.g. the row swaps to
  "Delete? Confirm / Cancel", or a small confirm popover) → `useDeleteEmbedding`,
  row shows pending.

## Known limitations (noted, not solved here)

- `/api/ai-rag` embeds synchronously, so a very large PDF (up to 50 MB, plus
  the PDF→HTML LLM step) could approach the serverless function timeout. No
  async job queue is introduced now; surfaced to the user. If it becomes a
  problem, a background-job follow-up is the fix.
- No optimistic UI for add (the processing time is server-bound); the list
  simply refetches on success.

## Testing

- Presentational (`.test.tsx`, jsdom): `TrainingDocUploadCard` (submit disabled
  with no file; status label switches idle→uploading→processing; error shown),
  `TrainingDocsList` (renders rows + count, empty state, search filters,
  delete calls back), `TrainingDocRow` (confirm-then-delete gating).
- Hooks (`src/data-hooks/__tests__/`): `useCourseEmbeddings` builds the right
  URL + parses; `useAddEmbeddings`/`useDeleteEmbedding` post the right payload
  and invalidate on success (mock `fetch`); `useUploadTrainingDoc` calls
  `upload` with a `training-docs/` key + file contentType (mock `@vercel/blob/client`).
- Tests import via `#/`, `vi.hoisted` mocks, matching repo conventions.

## Out of scope

- Text-paste ingestion (this UI is file-upload only; `/ai-rag` text mode stays available for other callers).
- Managing the org-wide (course_id NULL) migrated docs from this UI.
- Re-embedding/versioning beyond the delete-then-re-upload flow the API already supports.
