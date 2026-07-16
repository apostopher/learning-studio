# Lesson material from a Word doc — design

**Date:** 2026-07-17
**Status:** Approved (design), pending implementation
**Revision:** 2 — editable form + persistence (was: parse & return, read-only)

## Summary

Port the old `airmanship-web` `/api/word-processor` route into `rmtp-studio` as
a full admin feature. An admin opens a lesson's **Material** tab; if the lesson
already has material it loads into an editable form. The admin can upload a
`.docx`, which the server converts to HTML and sends through the Vercel AI
Gateway (Haiku) to extract a structured `CourseLessonMaterial` (text, key
points, pro tips, quiz, links, assignments, job of the day, attachments); the
parsed result **populates the editable form**. The admin reviews/edits and
**saves**, upserting into `lessonMaterialTable`.

## Decisions

- **Model:** `haiku` (`anthropic/claude-haiku-4.5`), from `src/ai/ai-provider.ts`.
  Formatting/extraction task → cheap, capable, Anthropic-consistent.
- **Gateway:** implicit — pass the model id string to `generateText` (AI SDK v6
  default provider is the Vercel AI Gateway, auth via `AI_GATEWAY_API_KEY`,
  already in `.env`). Matches `src/ai/generate-test.ts`. No `@ai-sdk/gateway`.
- **Scope:** full slice — parse route + editable RHF form + save (persist).
- **Output format (HTML prose + markdown quiz):** persisted material renders as
  HTML (`MaterialProse` uses `dangerouslySetInnerHTML` on `text`/`proTips`), so
  prose fields (`text`, `keyPoints`, `proTips`, `assignments`, `jobOfTheDay`)
  are **HTML** — matching the old repo. Quiz `question`/option `value` are
  **markdown**, per the quiz schema's `.describe()`.
- **Form layout:** a single scrollable panel in the Material tab (not a wizard) —
  an admin corrects the whole parsed document at once. react-hook-form 7.80 +
  `zodResolver(LessonMaterialGenerationSchema)` (zod v4).
- **Form-design principles applied:** every field has a visible label (never a
  placeholder-as-label); the Save button is always enabled and validates on
  submit; validation errors are shown inline and kept visible; conventional
  controls only (textareas, text inputs, add/remove list rows, a radio group for
  the quiz's correct option); a server-error alert on save failure.
- **Persistence without a migration:** `lessonMaterialTable` has no unique
  constraint on `lessonSlug` (and `schema.ts` carries the user's uncommitted
  edits — don't touch it). Upsert = `delete` existing rows for the slug then
  `insert`, in a `db.transaction`. `getLessonMaterial` already reads one row per
  slug, so this preserves the effective one-material-per-lesson model.
- **Attachments:** parsed and shown **read-only** ("detected, not saved").
  `lessonMaterialTable` has no attachments column; linking parsed attachment
  names to `blobFileAssignmentsTable` (old repo behavior) is deferred.

## Data flow

```
Open Material tab
  → useLessonMaterial(lessonId)  [GET /api/admin/lessons/:id/material, guarded]
    → form.reset(existing material | empty defaults)
Upload .docx
  → useParseLessonMaterial (multipart POST)
    → POST /api/admin/lesson-material/parse  [requireAdmin]
        → wordToHtml(buffer)            [mammoth: docx → HTML]
        → generateLessonMaterial(html)  [ai v6 · Output.object · haiku via Gateway]
        → Response.json(parsedMaterial)
    → form.reset(parsedMaterial)
Admin edits fields → Save
  → useSaveLessonMaterial(lessonId) (POST)
    → POST /api/admin/lessons/:id/material  [requireAdmin]
        → resolve slug from lessonId
        → upsertLessonMaterial: delete+insert lessonMaterialTable (txn)
        → Response.json(savedRow)
    → invalidate lessonMaterial(lessonId) query
```

## Components

### 1. docx → HTML — `src/lib/word-to-html.server.ts`
- `wordToHtml(buffer: Buffer): Promise<string>` wrapping
  `mammoth.convertToHtml({ buffer }, { ignoreEmptyParagraphs: true })`. Throws on
  failure or empty output. Add `mammoth@latest`. `.server` suffix, Node runtime.

### 2. Schemas — `src/types.ts`
- `LessonMaterialGenerationSchema = CourseLessonMaterialSchema.omit({ id: true })`
  + type `LessonMaterialGeneration`. Drives the AI output, the form
  (`zodResolver`), and the save-route body.

### 3. AI — `src/ai/generate-lesson-material.ts` + `src/ai/prompts/lesson-material.ts`
- `generateLessonMaterial(html): Promise<LessonMaterialGeneration>`, mirroring
  `generate-test.ts`: `generateText({ model: haiku, output: Output.object({ schema }), system, prompt })`.
- Prompt instructs HTML prose + markdown quiz, "10 Key Teaching Points"
  extraction, pro tips, quiz, links, attachment names, assignments, job-of-the-
  day URL; omit `<None>`/empty.

### 4. Parse route — `src/routes/api/admin/lesson-material.parse.ts`
- `POST /api/admin/lesson-material/parse`. `requireAdmin` → 403. Multipart
  `file`; validate docx MIME + ~4 MB cap → 400. Convert → generate →
  `Response.json`. Handler exported as a plain function for unit testing.

### 5. DB — `src/db/lesson.ts`
- `getLessonMaterialByLessonId(lessonId): Promise<LessonMaterialSelect | null>` —
  resolve slug from `lessonsTable`, then `getLessonMaterial(slug)`.
- `upsertLessonMaterial(lessonId, material): Promise<LessonMaterialSelect | null>` —
  resolve slug (null if lesson missing); `db.transaction`: delete rows for slug,
  insert mapped material (`attachments` dropped — no column), return the row.

### 6. Save/read route — `src/routes/api/admin/lessons.$lessonId.material.ts`
- Reuses sibling `guard`/`parseLessonId`.
- `GET` → `getLessonMaterialByLessonId` → `Response.json(row | null)`.
- `POST` → parse body with `LessonMaterialGenerationSchema` → `upsertLessonMaterial`
  → 404 if lesson missing → `Response.json(savedRow)`.

### 7. Hooks — `src/data-hooks/`
- `useParseLessonMaterial()` — multipart POST → parsed material (Task, no cache).
- `useLessonMaterial(lessonId)` — GET; maps the DB row (nullable) to
  `LessonMaterialGeneration` form values (or empty defaults). Key:
  `dataKeys.lessonMaterial(lessonId)`.
- `useSaveLessonMaterial(lessonId)` — POST form values; invalidates the material
  key on success.

### 8. Form UI — `src/components/admin/lesson-config/`
- `MaterialSectionContainer({ lesson })` — owns `useForm`, loads existing +
  parse into `form.reset`, wires save. Jotai atom not needed (RHF holds form
  state); a small atom only if cross-render coordination is required.
- Presentational, prop-driven (RHF field-array hooks are the accepted exception
  to "no hooks in presentational" — the standard RHF idiom):
  - `MaterialUpload` — `.docx` picker with pending/error state.
  - `MaterialTextFields` — labelled textareas/inputs for text, proTips,
    assignments, jobOfTheDay.
  - `StringListField` — reusable add/remove editor for a `string[]` (keyPoints,
    links).
  - `QuizField` — question cards; per-question option list + a radio group for
    the correct option; add/remove questions and options.
  - `MaterialForm` — composes the above + a "Save material" button + server-error
    alert; `onSubmit` = `form.handleSubmit(save)`.
- `AttachmentsList` (read-only) — shows detected attachment names when present.
- Wire a `material` section into `lesson-config-dialog-container.tsx`.

### 9. Query keys — `src/data-hooks/keys.ts`
- Add `lessonMaterial: (lessonId: number) => ['lesson-material', lessonId]`.

## Tests

- Schema parse (Task 1), `wordToHtml` (mocked mammoth), prompt builders,
  `generateLessonMaterial` (mocked `ai`), parse route (guard/validation/happy/
  error), save route (guard/validation/happy, mocked upsert), `useParseLessonMaterial`,
  `useSaveLessonMaterial` (mocked fetch), `StringListField` (add/remove),
  `QuizField` (render + add), `MaterialTextFields` (labels/values).
- DB functions (`upsertLessonMaterial`, `getLessonMaterialByLessonId`) verified by
  typecheck + route tests (mocked) + manual run — matching the repo's untested
  `db/*` convention.

## Out of scope (future)

- Linking parsed `attachments` to `blobFileAssignmentsTable`.
- A `lessonMaterialTable` unique-on-slug migration (delete+insert avoids it).
- PDF ingestion (old repo's `convertPdfToHtml`).
- Rich-text/markdown WYSIWYG editing (fields are plain textareas over HTML/markdown).
