# /ai-rag — Course-Scoped Embeddings API

**Date:** 2026-07-21
**Status:** Approved design, pending implementation plan

## Goal

Port the old repo's `/viper7-rag` document-ingestion endpoint into rmtp-studio as
`/api/ai-rag`, adding **course scoping**. The endpoint lets an admin add document
embeddings to the `docs` table (for RAG), list what's been ingested, and delete
by source — all optionally scoped to a `courseId`.

Reference (old impl): `airmanship-web/src/app/api/viper7-rag/route.ts`,
`src/ai/html-embeddings.ts`, `src/ai/embeddings-helper.ts`, `src/ai/gemini.ts`.

## Resolved decisions

- **Input:** support **both** a file reference (fetch + convert) and raw text/HTML.
- **courseId:** **optional**. Omitted → org-wide doc (`course_id` NULL), matching the
  6248 already-migrated rows. Provided → validated to exist, stored per-course.
- **Verbs:** **POST + GET + DELETE** (full parity with the old route).
- **PDF:** **supported**, via the same gateway-LLM conversion the old repo used
  (`google/gemini-2.5-flash`). DOCX via `mammoth`.
- **doc_urls:** **add a nullable `courseId`** so the same `sourcePath` can exist per
  course without collision.

## Hard constraint: embedding model

The 6248 existing `docs` rows were embedded with Google `gemini-embedding-001` at
**3072 dimensions**. Embeddings from different models are not comparable in one
vector space, so new embeddings **must** use the same model and dimensionality.
We replicate it exactly (`outputDimensionality: 3072`).

## Architecture & files

Thin route handler delegating to reusable, independently-testable server modules,
following repo conventions (`@/ai/*` AI logic, `@/db/*` DB access, routes stay thin,
zod validation, `requireAdmin` first).

| File | Responsibility |
| --- | --- |
| `src/routes/api/ai-rag.ts` | Route `/api/ai-rag`. POST/GET/DELETE handlers. Admin gate, parse, validate, delegate. No business logic. |
| `src/ai/embeddings-helper.ts` | Ported verbatim: `htmlToSections`, `chunkSectionTokens`, `splitIntoSentences`, `trySnapToSentenceBoundary`. 300-token chunks / 70 overlap. Pure. |
| `src/ai/embeddings.ts` | `generateHTMLEmbeddings({ courseId, sourcePath, html })`: chunk → `embedMany` (batches of 100) → insert. Course-scoped delete-before-insert + `onConflictDoNothing`. Returns `{ chunks }`. |
| `src/ai/gemini.ts` | `googleProvider` + `embeddingModel = google.textEmbeddingModel("gemini-embedding-001")` with `outputDimensionality: 3072`. |
| `src/common/html-converters.ts` | `convertWordToHtml` (mammoth) + `convertPdfToHtml` (gateway LLM `google/gemini-2.5-flash`). Ported/adapted from old. |
| `src/lib/ai-rag-schemas.ts` | zod schemas for POST (discriminated union), GET query, DELETE body. |
| `src/db/docs.ts` | `listDocsBySource(courseId?)`, `deleteDocsBySource(courseId?, sourcePath)`, doc_urls read/delete helpers. Keeps SQL out of the route. |

## Endpoints & contracts (all admin-only, `requireAdmin(request.headers)` first; 403 on `ForbiddenError`)

### POST /api/ai-rag
Discriminated JSON body on `mode`:

- **text mode:** `{ mode: "text", courseId?: number, sourcePath: string, html: string }`
- **file mode:** `{ mode: "file", courseId?: number, url: string, fileName: string, mimeType: string }`
  - `mimeType === "application/pdf"` → `convertPdfToHtml`
  - `mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"` → `convertWordToHtml`
  - otherwise → 400 invalid file type
  - `sourcePath` defaults to `file-${fileName}`

Both modes: validate `courseId` exists when present (400 if not); run
`generateHTMLEmbeddings`; in file mode also upsert a `doc_urls` row
`(courseId, sourcePath, url)`. Response: `{ success: true, sourcePath, chunks }`.
Empty extraction (0 chunks) → 400 "no text extracted".

### GET /api/ai-rag?courseId=
Returns docs grouped by `sourcePath` with counts, scoped to `courseId` when
provided (else org-wide `course_id IS NULL`). Response: `{ docsBySource: [{ sourcePath, count }] }`.

### DELETE /api/ai-rag
Body `{ courseId?: number, sourcePath: string }`. Deletes `docs` for
`(courseId, sourcePath)`, then reads matching `doc_urls`, calls Vercel `del()` for any
URL containing "vercel" (blob), deletes those `doc_urls` rows. Response `{ success, message }`.

## Data scoping

Every query filters by course: `eq(docs.courseId, id)` when provided, else
`isNull(docs.courseId)`. Delete-before-insert in `generateHTMLEmbeddings` is scoped
the same way, so re-ingesting a source for one course never wipes another course's
or the org-wide set. Insert conflicts resolve against the existing unique key
`uniq_course_source_heading_chunk` on `(course_id, source_path, heading, chunk)
NULLS NOT DISTINCT`.

## Schema change: doc_urls

Add nullable `courseId` (`integer references courses(id) on delete cascade`), and
change the unique index from `(source_path, url)` to `(course_id, source_path, url)`
with `NULLS NOT DISTINCT`. Apply via `db:push` (table is empty; if a rename prompt
appears in a non-TTY shell, apply the equivalent DDL directly as done previously).

## Dependencies & env

- Add deps: `@ai-sdk/google`, `gpt-tokenizer`.
- Add to `src/env.ts` server schema: `GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1)`,
  and to `.env`/`.env.local`.

## Error handling

- Auth failure → 403.
- Malformed JSON / failed zod parse → 400 with `error.flatten()`.
- Unknown/missing `courseId` → 400.
- Invalid file type → 400.
- Zero extracted text → 400.
- Unexpected errors → 500 with message; never leak stack traces.

## Testing

- **Unit** (`src/ai/__tests__/embeddings-helper.test.ts`): chunk counts, overlap,
  sentence-boundary snapping, min-paragraph filtering. Pure, no mocks.
- **Handler** (`src/routes/api/__tests__/ai-rag.test.ts`, mirroring existing admin
  route tests): mock `requireAdmin`, `embedMany`, DB, and blob `del`. Assert:
  403 when not admin; 400 on bad body / bad mime / unknown courseId / empty text;
  course-scoped delete-before-insert; `onConflictDoNothing`; doc_urls upsert in file
  mode; blob cleanup on DELETE; GET grouping scoped by course.
- Follow repo vitest conventions (memory: use `#/` alias, `vi.hoisted` mocks).

## Out of scope

- Retrieval/query endpoint (this is ingestion only).
- Backfilling `courseId` on the 6248 migrated rows (they stay org-wide/NULL).
- Any client UI; this is API-only. Client consumers will use TanStack Query later.
