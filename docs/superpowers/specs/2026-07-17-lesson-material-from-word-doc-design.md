# Lesson material from a Word doc — design

**Date:** 2026-07-17
**Status:** Approved (design), pending implementation plan

## Summary

Port the old `airmanship-web` `/api/word-processor` route into `rmtp-studio`.
An admin uploads a `.docx` lesson document; the server converts it to HTML,
sends it through the Vercel AI Gateway (Haiku) to extract a structured
`CourseLessonMaterial` (text, key points, pro tips, quiz, links, assignments,
job of the day, attachments), and **returns the parsed result for the admin to
review**. Nothing is persisted in this pass — persisting/editing lesson material
is a deliberate follow-up (there is no material-save endpoint yet).

## Decisions

- **Model:** `haiku` (`anthropic/claude-haiku-4.5`), reusing the existing
  `src/ai/ai-provider.ts` constant. It is a formatting/extraction task, so Haiku
  is cheap and capable, and keeps the repo Anthropic-consistent.
- **Gateway:** implicit, via passing the model id string to `generateText`
  (the AI SDK v6 default provider is the Vercel AI Gateway, authenticated by
  `AI_GATEWAY_API_KEY` — already added to env). This matches how
  `src/ai/generate-test.ts` already works. No `@ai-sdk/gateway` package.
- **Scope:** parse & return for review. Full slice = API route + data-hook +
  admin UI (upload → generate → **read-only preview**). Editable form + save is
  out of scope (separate spec).
- **Markdown, not HTML:** the repo's quiz schema `.describe()`s specify markdown
  (unlike the old repo's HTML output), so the prompt emits markdown.

## Data flow

```
Admin picks .docx
  → useParseLessonMaterial (TanStack Query mutation, multipart POST)
    → POST /api/admin/lesson-material/parse   [requireAdmin guard → 403]
        → wordToHtml(buffer)            [mammoth: docx → HTML]
        → generateLessonMaterial(html)  [ai v6 · Output.object · haiku via Gateway]
        → Response.json(parsedMaterial)
    → hook Zod-parses response
  → admin reviews parsed result (read-only) in the lesson-config dialog
```

## Components

### 1. docx → HTML — `src/lib/word-to-html.server.ts`

- `export async function wordToHtml(buffer: Buffer): Promise<string>`
- Wraps `mammoth.convertToHtml({ buffer }, { ignoreEmptyParagraphs: true })`,
  returns `result.value`.
- **Throws** on conversion failure (route maps to 500) — unlike the old repo's
  wrapper which swallowed errors and returned `""` (feeding empty HTML to the
  model). Empty/whitespace-only output is also treated as a failure.
- Add `mammoth` to `package.json` dependencies.
- Node runtime only (mammoth uses Node built-ins); `.server` suffix keeps it off
  the client bundle. Modern Node has a global `File`, so no polyfill is expected;
  if mammoth complains under the deploy runtime, add a `File` polyfill import.

### 2. Generation schema — `src/types.ts`

Next to `CourseLessonMaterialSchema`:

```ts
export const LessonMaterialGenerationSchema = CourseLessonMaterialSchema.omit({
  id: true,
});
export type LessonMaterialGeneration = z.infer<
  typeof LessonMaterialGenerationSchema
>;
```

Reuses the canonical material shape minus the DB `id` the model can't produce.
Fields: `text`, `keyPoints`, `proTips`, `quiz` (required; empty string/array when
absent in the doc), and optional `links`, `assignments`, `jobOfTheDay`,
`attachments`.

### 3. AI module — `src/ai/generate-lesson-material.ts`

- `export async function generateLessonMaterial(html: string): Promise<LessonMaterialGeneration>`
- Mirrors `src/ai/generate-test.ts`:

  ```ts
  const { output } = await generateText({
    model: haiku,
    output: Output.object({ schema: LessonMaterialGenerationSchema }),
    system: lessonMaterialSystemPrompt,
    prompt: lessonMaterialUserPrompt(html),
  });
  return output;
  ```

- Prompt lives in `src/ai/prompts/lesson-material.ts` (matching the `prompts/`
  convention: `lessonMaterialSystemPrompt`, `lessonMaterialUserPrompt(html)`).
  Adapted from the old formatter prompt, but instructs **markdown** output,
  extraction of the "10 Key Teaching Points", pro tips, quiz, links, attachments
  (by file name), assignments, and job-of-the-day URL; omit `<None>`/empty
  values.

### 4. API route — `src/routes/api/admin/lesson-material.parse.ts`

- Path: `POST /api/admin/lesson-material/parse`. Flat (no `$lessonId`) because
  parsing doesn't touch the lesson; a future `lesson-material.$lessonSlug.ts`
  can own save.
- Reuses the repo's admin guard pattern:

  ```ts
  async function guard(request: Request): Promise<Response | null> {
    try { await requireAdmin(request.headers); return null; }
    catch (error) {
      if (error instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
      throw error;
    }
  }
  ```

- Handler:
  1. `guard(request)` → early 403.
  2. `await request.formData()`, read `file`.
  3. Validate presence + docx MIME
     (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
     + size cap (~4 MB — Vercel serverless request-body limit) → 400 on failure.
  4. `wordToHtml(Buffer.from(await file.arrayBuffer()))`.
  5. `generateLessonMaterial(html)`.
  6. `Response.json(material)`.
  - try/catch: bad file → 400; conversion/AI failure → 500, logged via
    `console.error`.
- **Body-size tradeoff:** direct multipart is simplest and docx are usually
  small, but Vercel serverless caps the request body at ~4.5 MB. If lesson docs
  grow (embedded images), switch to the existing client-blob-upload flow
  (`/api/admin/uploads`) then fetch the blob server-side. Out of scope now.

### 5. Data-hook — `src/data-hooks/use-parse-lesson-material.ts`

```ts
export function useParseLessonMaterial() {
  return useMutation<LessonMaterialGeneration, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/lesson-material/parse', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error(`Failed to parse lesson material (${res.status})`);
      return LessonMaterialGenerationSchema.parse(await res.json());
    },
  });
}
```

No cache invalidation (nothing persisted).

### 6. Admin UI

- Add a **Material** section to
  `src/components/admin/lesson-config-dialog-container.tsx`, replacing one of the
  dashed placeholder panels (`PLACEHOLDER_SECTIONS`).
- Container `src/components/admin/lesson-config/material-section-container.tsx`:
  jotai atom for the parsed-material-under-review state, the
  `useParseLessonMaterial` hook, wiring upload → generate → preview.
- Presentational component(s): a Base UI + lucide file/dropzone control with a
  loading state during generation, then a **read-only preview** of the parsed
  material (text, key points, pro tips, quiz, links, assignments, job of the day,
  attachments) so the admin can verify the parse worked.
- Editable form + Save button are **out of scope** (no save endpoint yet).

### 7. Tests

- `src/ai/__tests__/generate-lesson-material.test.ts`: mock `generateText`
  (as the existing AI tests do), assert `generateLessonMaterial` returns the
  schema-shaped output and passes the right model/prompt.
- Route test: the `requireAdmin` → 403 branch and the docx-MIME/size → 400
  validation branches.

## File change list

| File | Change |
| --- | --- |
| `package.json` | add `mammoth` dependency |
| `src/env.ts` | (optional) add `AI_GATEWAY_API_KEY` to server schema for validation |
| `src/lib/word-to-html.server.ts` | new — `wordToHtml(buffer)` |
| `src/types.ts` | new — `LessonMaterialGenerationSchema` / `LessonMaterialGeneration` |
| `src/ai/prompts/lesson-material.ts` | new — system + user prompt |
| `src/ai/generate-lesson-material.ts` | new — `generateLessonMaterial(html)` |
| `src/routes/api/admin/lesson-material.parse.ts` | new — guarded POST route |
| `src/data-hooks/use-parse-lesson-material.ts` | new — mutation hook |
| `src/components/admin/lesson-config/material-section-container.tsx` | new — container |
| `src/components/admin/lesson-config/*.tsx` | new — presentational upload/preview |
| `src/components/admin/lesson-config-dialog-container.tsx` | edit — add Material section |
| `src/ai/__tests__/generate-lesson-material.test.ts` | new — unit test |
| route test | new — guard + validation branches |

## Out of scope (future spec)

- Persisting reviewed material (`upsert` into `lessonMaterialTable`) and a
  `lesson-material.$lessonSlug` save endpoint.
- An editable review form (react-hook-form + zod resolver, quiz editor).
- Linking parsed `attachments` (by name) to `blobFileAssignmentsTable` (the old
  repo's `getBlobFilesByNames` behavior).
- PDF ingestion (the old repo also had `convertPdfToHtml`).
