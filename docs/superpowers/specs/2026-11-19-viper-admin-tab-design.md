# AI Training admin tab — design

Date: 2026-11-19. Status: draft for review.

## Intent

The old platform (`airmanship-web/src/app/admin/viper7`) had one admin page for
training the AI assistant, Viper7: test chat, persona, training documents, past
sessions. This repo already has persona editing and training-document upload,
but only inside a course's "AI training" dialog, opened from the Courses tab,
which is hidden (2026-11-18). So today no admin can reach either.

Bring the old page across as a new admin tab, in this repo's theme, built on
what this repo already has.

## Goals

- An **AI Training** tab in the admin nav, after People:
  `/admin?section=ai-training` (name: user, 2026-11-19).
- Four sections, as in the old page: **Chat**, **Persona**, **Documents**,
  **Sessions**.
- Every training document records where it came from: **ITPS** or
  **3D Airmanship**. Shown on each document, chosen on upload, filterable.

## Non-goals

- The source tag does **not** change what Viper retrieves (user's call: "label
  only for now"). `searchKB` is untouched.
- No Langfuse. Sessions read this repo's own chat tables.
- No per-course training on this tab. It trains the docs every course shares
  (`docs.course_id IS NULL`). The course dialog stays as it is.
- No changes to how student chats are persisted or summarised.

## Anti-goals

- A migration that drops or rewrites embeddings. `db:push` wants to truncate
  `docs` over unrelated drift (6,917 rows at risk); the column is added by a
  hand-written SQL statement.
- Visual drift from the rest of admin: no gradients, no hardcoded colours, no
  `.container`; existing tokens, Base UI, logical properties only.

## Constraints

- `.env.local` points at the PRODUCTION database. The migration is run on prod
  only by the user, or with the user's explicit go.
- Training endpoints guard with `requireAdmin`; the tab's gate mirrors that.
- Presentational/container split, jotai for client state, TanStack Query for
  all server data, react-hook-form + zod for forms (repo rules).

## Approaches considered

1. **Reuse this repo's persona and training components on a page (chosen).**
   The upload card, docs list, persona list/editor/publish flow and their
   data hooks already exist and are tested; the page re-hosts them. Chat
   is a preview endpoint built from the student chat's parts. Least new code; the tab and the course
   dialog stay consistent.
2. **Port the old Viper7 components and restyle them.** Faithful to the old
   page, but duplicates working code here, and the old components use
   `useState`, `alert()`, Langfuse and Next.js APIs this repo doesn't have.
3. **Un-hide the Courses tab.** Reaches the existing dialog with no new code,
   but training stays per course, there is no Chat or Sessions, and the user
   hid Courses on purpose.

## Design

### Data: `docs.source`

- New column `docs.source text NOT NULL DEFAULT '3d-airmanship'`, with a CHECK
  limiting it to `'itps' | '3d-airmanship'`. Drizzle: a `text` column with
  `$type<DocSource>()` and the check in the table's extras.
- Existing rows: all are 3D Airmanship (user, 2026-11-19), so the default
  backfills them in the same statement. No separate backfill. This includes
  lesson chunks (`lesson_slug` set), among them chunks of the ITPS course's UAS
  lesson copies. They never appear in the docs list and the tag drives nothing,
  so their label is inert; if the tag ever drives retrieval, revisit them
  first. (My call.)
- Shared zod enum `DocSourceSchema = z.enum(['itps', '3d-airmanship'])` with
  labels `ITPS` and `3D Airmanship`, in one module both server and client
  import.
- Migration: a hand-written SQL file (`ALTER TABLE docs ADD COLUMN …`), not
  `drizzle-kit generate` (migrations folder is stale) and not `db:push`.
- `POST /api/ai-rag` takes `source` (required, from `DocSourceSchema`) and
  writes it on every chunk. `GET /api/ai-rag` returns `source` per document
  (grouped by `sourcePath`). `sourcePath` is `file-<name>`, and re-uploading
  a name replaces its chunks, so uploading the same file name under the other
  source relabels it: intended, the latest upload wins (my call). Existing callers (the
  course dialog) send `'3d-airmanship'` until they get the picker too.

### Tab

- `ADMIN_SECTION_IDS` gains `'ai-training'`, label **AI Training**, last in nav order.
- Gate: `hasAdminAccess(roles)`, mirroring `requireAdmin` on `/api/ai-rag`
  and the persona endpoints.
- Inner sections are a second query param, `trainingSection`, with values
  `chat | persona | documents | sessions`, default `documents` (the reason the
  tab exists). Shown as a vertical list at the start of the page on wide
  screens, as tabs above the content on narrow ones, same pattern as the
  course dialog's `SectionedConfigModal` sidebar.

### Documents

The old page called this "Training"; renamed so it does not repeat the tab's
name (my call).

- Reuses `TrainingDocUploadCard` and `TrainingDocsList`. Their data hooks
  (`useCourseEmbeddings`, `useAddEmbeddings`, `useDeleteEmbedding`) are typed
  for a numeric `courseId`; widen them to `number | null`, where null means
  the docs shared by every course (no `courseId` param) with its own query
  key.
- Upload form adds a **Source** radio group (ITPS / 3D Airmanship), required,
  no default selected, so nobody files an ITPS document as 3D Airmanship by
  not looking.
- Each document row shows its source as a chip.
- The list gets a source filter (All / ITPS / 3D Airmanship) beside the
  existing search; the filter lives in a jotai atom.

### Persona

- Reuses the persona list, editor, draft autosave and Publish from
  `components/admin/persona`, for the deployment's org (`getActiveOrgId()`,
  from `ACTIVE_ORG_ID`; there is no per-admin org).
- No per-course selection here: the tab shows the org's personas and which one
  is the org default ("Make default"). `PersonaSectionContainer` requires
  `courseId` and drives `useCoursePersona`/`useSetCoursePersona` from it, so
  this is a refactor: split the course-selection part out, or compose the
  list and editor directly in a new container. The course dialog's behaviour
  must not change.

### Chat

Purpose (user, 2026-11-19): "to see the performance of viper". The admin
picks a lesson, then chats, to judge how well Viper answers about it.

- A **preview** chat on a new admin endpoint, `POST /api/admin/viper/preview`,
  `requireAdmin`-guarded. It reuses the student chat's building blocks
  (`buildChatStream`, the search tool's `searchKB` + `buildKBContext`) but is
  not the student endpoint.
- **Lesson picker first:** a searchable picker over the knowledge library's
  lessons. Chat input is disabled until a lesson is picked, and says so.
  Changing the lesson starts a new conversation (the old answers were about
  another lesson).
- **What Viper knows in a preview:** the picked lesson's chunks
  (`lessonSlugs: [slug]`) plus the docs shared by every course
  (`courseId: null`), plus help topics. No course outline and no lesson
  gating: there is no learner to gate for. (My call: student chats are scoped
  by course, not lesson; the lesson is the unit the admin asked to test.)
- **Persona:** a picker over the org's personas, defaulting to the org
  default. It uses the persona's **draft** if one exists, otherwise its
  published content, so an edit can be tested before students see it. The
  header says which ("Testing draft" / "Testing published").
- **No learner:** no SKA profile, no debrief gaps, no open-debrief questions,
  no debrief guard. User info is a neutral placeholder learner, not the
  admin.
- **Nothing is saved:** no `ai_chats` row; the conversation lives in client
  state and is sent whole each turn. It never appears in Sessions.
- "New chat" clears the conversation, keeping the lesson and persona.

### Sessions

- List of chats from `ai_chats`, newest first, showing title, the learner's
  name, last updated, and message count; paged (50 per page).
- Video calls (Tavus) store their transcript as an `ai_chats` row
  (`video_calls.chat_id`); the list joins `video_calls` and marks those
  sessions **Video call** (my call).
- Selecting one shows its messages read-only, rendered with the same message
  component the student chat uses.
- New admin endpoints, `requireAdmin`-guarded:
  `GET /api/admin/viper/sessions?page=` and
  `GET /api/admin/viper/sessions/$chatId`.
- These are learners' private conversations. Read-only, admin-only, and the
  old platform showed the same through Langfuse.

## States every section handles

Loading, empty (with what to do next, e.g. "No training documents yet. Upload
a PDF or Word file above."), error with retry, and for Training: uploading and
embedding progress (already in `deriveUploadStatus`).

## Left to the builder

- Exact component split for the page shell and the inner section nav.
- Whether Sessions uses TanStack Table (repo rule for tables) or a list; it's
  a list of conversations, so a list is fine unless columns are added.
- Search on Sessions: not required for v1.

## Rollout

1. User runs `pnpm db:migrate-doc-source` on prod (or says go).
2. Merge and deploy.

The order must be migrate → deploy. Drizzle names every column in the schema
in its INSERTs, and the schema now has `docs.source`. So deploying first, or
running this branch locally against prod (`.env.local` points at prod), before
the column exists breaks three things:

- **Uploads.** The `docs` INSERT fails.
- **`GET /api/ai-rag`.** It selects `source`, so it returns 500 and the
  document lists fail to load.
- **The lesson re-embed after a lesson-material save.** This one is silent.
  It runs in `waitUntil`, the error is only logged, and the lesson keeps its
  old chunks, so Viper answers from stale material with no visible failure.
