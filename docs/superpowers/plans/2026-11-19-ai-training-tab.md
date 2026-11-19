# AI Training Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-only "AI Training" tab with four sections (Documents, Persona, Chat, Sessions), and an ITPS / 3D Airmanship source label on every training document.

**Architecture:** A new admin section `ai-training` renders a page shell whose inner section lives in a `trainingSection` query param. Documents and Persona re-host the existing course-dialog components with the course made optional. Chat is a new admin preview endpoint that reuses `buildChatStream` with an injected lesson-scoped search tool and nothing persisted. Sessions reads `ai_chats` through two new admin endpoints. One hand-written migration adds `docs.source`.

**Tech Stack:** TanStack Start (file routes, server handlers), TanStack Query, jotai, react-hook-form + zod, Base UI, Tailwind (logical props), AI SDK (`useChat`, `DefaultChatTransport`, `streamText`), Drizzle + Postgres/pgvector, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-19-viper-admin-tab-design.md`

## Global Constraints

- **The database in `.env.local` is PRODUCTION.** Never run the migration, `db:push` or `drizzle-kit generate`. The migration script is written and tested only. The user runs it.
- **Copy, verbatim:**
  - Tab label: `AI Training`.
  - URL: `?section=ai-training`.
  - Inner sections, in order: `Documents`, `Persona`, `Chat`, `Sessions`, with param values `documents | persona | chat | sessions`. The default is `documents`.
  - Source labels: `ITPS`, `3D Airmanship`. Values: `itps`, `3d-airmanship`.
  - Session marker: `Video call`.
  - Persona state in chat: `Testing draft` / `Testing published`.
- **Gate:** `hasAdminAccess(roles)` in the UI. Every new endpoint calls `requireAdmin(request.headers)` and returns 403 on `ForbiddenError`, the same way `ai-rag.ts`'s `guard` does.
- **Imports:** vitest needs `#/`, not `@/`. Stub components the same way neighbouring tests do. There is no jest-dom.
- **Architecture rules:**
  - Presentational components stay hookless. Containers own the hooks.
  - Client state goes in jotai atoms in `src/atoms/admin.ts`. Server data goes through TanStack Query hooks in `src/data-hooks/`.
  - Styling uses existing tokens only, logical properties and no `.container`.
- **Tests assert what the consumer received:** mutation and fetch bodies, the arguments passed to `searchKB`, and the props a component was given.
- **Every disabled control states why,** both visibly and in its accessible name.
- **Never run `biome format --write src`.**

## Review Focus

1. **Preview requests a persona from another org, or one that doesn't exist:** expect a 404 and no model call. Test in Task 6.
2. **Preview search scope:** the search must not reach course-scoped documents or another lesson's chunks. `searchKB` receives exactly `{ courseId: null, lessonSlugs: [slug] }`. Test in Task 6.
3. **The course dialog's upload after `source` becomes required:** it still succeeds and sends `3d-airmanship`. Test in Task 2.
4. **The admin switches lesson mid-conversation:** the conversation is cleared, so old answers aren't read as answers about the new lesson. Test in Task 6.
5. **A learner with no profile name, or a chat with zero messages, in Sessions:** the row still renders with a fallback name and a count of 0, and the query doesn't drop the chat. Test in Task 7.

---

### Task 1: `docs.source` column, shared enum, migration script

**Files:**
- Create: `src/lib/doc-source.ts`, `src/db/migrate-doc-source.ts`
- Modify: `src/db/schema.ts` (the `docs` table), `package.json` (scripts)
- Test: `src/lib/__tests__/doc-source.test.ts`, `src/db/__tests__/migrate-doc-source.test.ts`

**Interfaces:**
- Produces:
  - `DocSourceSchema = z.enum(['itps', '3d-airmanship'])`
  - `type DocSource`
  - `DOC_SOURCE_LABELS: Record<DocSource, string>`
  - `DEFAULT_DOC_SOURCE: DocSource = '3d-airmanship'`
  - `docs.source`, a `text` column with `$type<DocSource>()` that is not null and defaults to `'3d-airmanship'`, plus a check constraint `docs_source_check`.
  - `DOC_SOURCE_STATEMENTS: SQL[]`

- [ ] **Step 1: Write the failing tests.**
  - `doc-source.test.ts` checks two things. First, `DOC_SOURCE_LABELS` equals `{ itps: 'ITPS', '3d-airmanship': '3D Airmanship' }`. Second, `DocSourceSchema.safeParse('ITPS').success === false`.
  - `migrate-doc-source.test.ts` follows the pattern in `migrate-knowledge-chunks.test.ts`, mocking `#/db` and rendering with `PgDialect`. It checks four things:
    - Every statement is re-runnable (`if not exists`, or a constraint guarded by a `pg_constraint` lookup inside a `DO` block).
    - Nothing destructive: no `drop`, `truncate` or `delete from`.
    - The column statement contains `add column if not exists "source" text not null default '3d-airmanship'`.
    - The check statement names `docs_source_check` and contains both values.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/doc-source.test.ts src/db/__tests__/migrate-doc-source.test.ts`. **Expected:** FAIL, because the modules don't exist yet.
- [ ] **Step 3: Implement.**
  - Write `doc-source.ts`.
  - Add the column and the `check('docs_source_check', sql\`...\`)` to the `docs` table.
  - Write `migrate-doc-source.ts` in the same shape as `migrate-knowledge-chunks.ts`: export the statements, plus a `main()` that runs them only when the file is executed directly.
  - Add the script `"db:migrate-doc-source": "dotenv -e .env.local -- tsx src/db/migrate-doc-source.ts"`.
  - Lesson-chunk inserts in `src/ai/embeddings.ts` are untouched. They take the default.
- [ ] **Step 4: Run** the same command. **Expected:** PASS. Also run `npx tsc --noEmit -p .` and expect 0 errors.
- [ ] **Step 5: Commit** `feat(db): docs.source labels training docs ITPS or 3D Airmanship`

### Task 2: Uploads record source; list returns it

**Files:**
- Modify:
  - `src/lib/ai-rag-schemas.ts` (`fileMode` and `textMode` gain `source: DocSourceSchema`)
  - `src/ai/embeddings.ts` (`generateHTMLEmbeddings` takes `source` and writes it on every chunk)
  - `src/routes/api/ai-rag.ts` (passes `source` through; GET rows carry `source`)
  - `src/db/docs.ts` (`listDocsBySource` returns `{ sourcePath, count, source }`, grouping by `sourcePath` and selecting `max(docs.source)`)
  - `src/data-hooks/use-add-embeddings.ts` (`AddEmbeddingsInput` gains `source: DocSource`)
  - `src/data-hooks/use-course-embeddings.ts` (the response schema and `CourseEmbeddingDoc` gain `source`)
  - `src/components/admin/course-embeddings-dialog-container.tsx` (sends `source: DEFAULT_DOC_SOURCE`)
- Test: `src/routes/api/__tests__/ai-rag.test.ts`, `src/ai/__tests__/embeddings.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `generateHTMLEmbeddings({ courseId, sourcePath, html, source })`
  - `GET /api/ai-rag` returns `docsBySource: { sourcePath, count, source }[]`
  - `AddEmbeddingsInput = { url, fileName, mimeType, source }`

- [ ] **Step 1: Write the failing tests.**
  - `it('rejects an upload with no source')`: a POST in file mode without `source` returns 400, and `generateHTMLEmbeddings` is never called.
  - `it('passes the chosen source to the embedder')`: with `source: 'itps'`, `generateHTMLEmbeddings.mock.calls[0][0].source === 'itps'`.
  - `it('lists each document with its source')`: GET returns a row's `source` from the mocked `listDocsBySource`.
  - In `embeddings.test.ts`, `it('writes the source on every chunk')`: every inserted value has `source: 'itps'`.
  - Mutant check: dropping `source` from the insert must fail this test.
- [ ] **Step 2: Run** `npx vitest run src/routes/api/__tests__/ai-rag.test.ts src/ai/__tests__/embeddings.test.ts`. **Expected:** the new tests FAIL.
- [ ] **Step 3: Implement.** Follow the Interfaces block above. The course dialog keeps working by sending the default.
- [ ] **Step 4: Run** the same command plus `npx tsc --noEmit -p .`. **Expected:** PASS and 0 errors.
- [ ] **Step 5: Commit** `feat(ai-rag): uploads record their source; the list returns it`

### Task 3: AI Training section, page shell, Documents

**Files:**
- Modify:
  - `src/lib/admin-sections.ts` (`'ai-training'` is last in `ADMIN_SECTION_IDS`, label `AI Training`, gate `hasAdminAccess(roles)`)
  - `src/routes/_authed/admin.index.tsx` (renders `AiTrainingPageContainer`)
  - `src/data-hooks/keys.ts`, `use-course-embeddings.ts`, `use-add-embeddings.ts`, `use-delete-embedding.ts`: `courseId: number | null`. Null sends no `courseId` param and no body field. The key is `dataKeys.courseEmbeddings(courseId)` with null allowed.
  - `src/components/admin/training-docs-list.tsx`:
    - New optional prop `sourceFilter?: { value: DocSource | 'all'; onChange }`. When given, it renders an All / ITPS / 3D Airmanship control beside the search, and the search and source filter combine.
    - Each row shows its source as a `Chip` with tone `neutral` when `doc.source` is present.
  - `src/components/admin/training-doc-row.tsx` (a `source?: DocSource` prop drives that chip)
  - `src/components/admin/training-doc-upload-card.tsx`:
    - New optional prop `source?: { value: DocSource | null; onChange }`.
    - When given, it renders a required Base UI `RadioGroup` labelled `Source`, with no option selected.
    - Submit is disabled while the value is null, and the button's name reads `Choose a source first`.
  - `src/atoms/admin.ts` gains:
    - `aiTrainingSearchAtom`
    - `aiTrainingSourceFilterAtom` (default `'all'`)
    - `aiTrainingUploadSourceAtom` (default `null`)
- Create:
  - `src/lib/ai-training-sections.ts`: `AI_TRAINING_SECTIONS` holds ids and labels in nav order. It also exports `aiTrainingSearchSchema`, a loose object whose `trainingSection` is an optional enum with `.catch(undefined)`.
  - `src/components/admin/ai-training/ai-training-page.tsx` (presentational): props `{ sections, active, onSelect, children }`. It renders a vertical nav at the start on `md` and up, and tabs above the content below that. Use the Base UI `Tabs`.
  - `src/components/admin/ai-training/ai-training-page-container.tsx`: reads and writes `trainingSection` via `Route.useSearch` / `navigate` (not nuqs, per the courses-tab memory) and renders the active section. Persona, Chat and Sessions render nothing until Tasks 4, 6 and 7 add them.
  - `src/components/admin/ai-training/documents-section-container.tsx`: the course dialog's `Body` with `courseId: null`, the upload source and the filter. The upload sends the chosen source.
- Test: `src/lib/__tests__/admin-sections.test.ts` (extend), `src/routes/_authed/__tests__/admin-section-route.test.tsx` (extend), `src/components/admin/__tests__/training-docs-list.test.tsx`, `src/components/admin/ai-training/__tests__/documents-section-container.test.tsx`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `AiTrainingPageContainer` renders the section whose id is in `trainingSection`.
  - Later tasks add their containers to its section map: `persona` → `PersonaSectionContainer` (no course), `chat` → `PreviewChatContainer`, `sessions` → `SessionsSectionContainer`.

- [ ] **Step 1: Write the failing tests.**
  - `it('offers AI Training to admins only, last in the nav')`: `visibleAdminSections` for admin roles ends with `{ id: 'ai-training', label: 'AI Training' }`, and for a staff-only context it does not include it.
  - `it('sends a non-admin typing ?section=ai-training to the default')`: follow the existing route-guard test.
  - `it('filters by source and search together')`: given an ITPS "Wx brief" and a 3D Airmanship "Wx basics", setting the filter to `itps` with search `wx` shows only "Wx brief".
  - `it('uploads shared docs with the chosen source')`: in the container test, mock `fetch`. Pick ITPS, attach a file and submit. The `/api/ai-rag` POST body has `source: 'itps'` and no `courseId`.
  - `it('will not upload until a source is chosen')`: the button is named `Choose a source first`, and clicking it sends no POST.
- [ ] **Step 2: Run** the four test files. **Expected:** the new tests FAIL.
- [ ] **Step 3: Implement** the files listed above.
- [ ] **Step 4: Run** the same files plus `npx tsc --noEmit -p .`. **Expected:** PASS. Also run the existing `course-embeddings` tests, which must still pass.
- [ ] **Step 5: Commit** `feat(admin): AI Training tab with shared training documents and source labels`

### Task 4: Persona without a course

**Files:**
- Modify:
  - `src/components/admin/persona/persona-section-container.tsx`: replace the props with `course?: { id: number; name: string }`. When absent:
    - `useCoursePersona` is disabled, which means it needs an `enabled` option. Add it as `useCoursePersona(courseId: number | null)`, enabled when not null.
    - There is no course selection.
  - `src/components/admin/persona/persona-list.tsx`: make `courseName`, `courseLinked`, `selectedPersonaId` and `onSelectForCourse` one optional `courseSelection?: {...}` prop. Without it, the list shows no "use for this course" control and no selection, and keeps the default marker and "Make default".
  - `src/data-hooks/use-course-persona.ts`
  - `src/components/admin/course-embeddings-dialog-container.tsx` (passes `course={course}`)
  - `ai-training-page-container.tsx` (the `persona` section)
- Test: the existing persona tests (update their props), plus `src/components/admin/persona/__tests__/persona-list.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - `it('shows no course selection without a course')`: no element named like `/use for/i`, and the "Make default" control is present.
  - `it('still selects for a course in the dialog')`: with `courseSelection`, clicking a persona's select calls `onSelectForCourse(id)`.
- [ ] **Step 2: Run** `npx vitest run src/components/admin/persona`. **Expected:** the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `npx tsc --noEmit -p .`. **Expected:** PASS.
- [ ] **Step 5: Commit** `refactor(admin): persona editor works without a course; AI Training Persona section`

### Task 5: Lesson-scoped search tool and an injectable tool on `buildChatStream`

**Files:**
- Modify:
  - `src/ai/tools/search-kb.ts`: add `makePreviewSearchKBTool({ lessonSlug, writer })`, with the same description and input schema as `makeSearchKBTool`. It runs `searchKB(query, { courseId: null, lessonSlugs: [lessonSlug] })`, then `buildKBContext({ kbResults, outline: '', helpTopics })`. It keeps the short-query guard.
  - `src/ai/chat.ts`: `BuildChatStreamOptions` gains `searchKBTool?: Tool`. In `streamText`, use `searchKB: searchKBTool ?? makeSearchKBTool({ writer, courseSlug, userId })`.
- Test: `src/ai/tools/__tests__/search-kb.test.ts` (create if missing), `src/ai/__tests__/chat.test.ts` (extend if present, else create)

**Interfaces:**
- Produces: `makePreviewSearchKBTool(opts: { lessonSlug: string; writer?: { write: (p: unknown) => void } }): Tool` and `BuildChatStreamOptions.searchKBTool`.

- [ ] **Step 1: Write the failing tests.**
  - `it('searches only the picked lesson and the shared docs')`: calling the tool's `execute({ query: 'crosswind limits' })` calls `searchKB` with `('crosswind limits', { courseId: null, lessonSlugs: ['crosswind-landings'] })`.
  - `it('uses an injected search tool instead of the course one')`: mock `streamText` and `makeSearchKBTool`. `streamText.mock.calls[0][0].tools.searchKB` is the injected tool, and `makeSearchKBTool` is not called.
- [ ] **Step 2: Run** the two files. **Expected:** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the two files plus `npx vitest run src/routes/api/__tests__/chat.test.ts`. **Expected:** PASS. The student chat is unchanged.
- [ ] **Step 5: Commit** `feat(ai): lesson-scoped search tool; buildChatStream accepts an injected one`

### Task 6: Preview chat endpoint and Chat section

**Files:**
- Create:
  - `src/lib/viper-preview-schemas.ts`: `previewChatRequestSchema = z.object({ personaId: z.number().int().positive(), lessonSlug: z.string().min(1), messages: z.array(z.unknown()).min(1).max(40) })`
  - `src/routes/api/admin/viper.preview.ts`: `POST /api/admin/viper/preview`.
    - Guard first.
    - Load the persona with `getPersonaById(personaId)` and check that `orgId === getActiveOrgId()`. If not, return 404 `{ error: 'Persona not found' }`.
    - Check the lesson exists by slug. If not, return 404 `{ error: 'Lesson not found' }`.
    - Call `buildChatStream` with:
      - `messages` and `uiMessages`: the validated messages
      - `persona: draftContent ?? content`
      - `userInfo: { name: 'Preview learner', callSign: '', location: '' }`
      - `subscriptions: []`
      - `userId`: the admin's id
      - `searchKBTool: makePreviewSearchKBTool({ lessonSlug, writer })`
      - no `courseSlug`, no SKA, no gaps and no open questions
    - Stream it with `createUIMessageStream` the way `chat.ts` does. There is no `onFinish` persistence.
  - `src/lib/library-lessons.ts`: `flattenLibraryLessons(library: OrgLibrary): { slug: string; name: string }[]`. It returns every lesson across disciplines' modules, their `untitled`, and the org-level `untitled`, deduped by slug and sorted by name (`localeCompare`).
  - `src/components/admin/ai-training/preview-chat.tsx` (presentational): a lesson combobox (Base UI `Combobox`), a persona select, a `Testing draft` / `Testing published` line, `New chat`, messages rendered with `ChatMessage`, and an input.
    - The input is disabled until a lesson is picked. Its name and placeholder read `Pick a lesson to start`.
  - `src/components/admin/ai-training/preview-chat-container.tsx`:
    - Holds `useChat` with a `DefaultChatTransport` pointed at `/api/admin/viper/preview`, whose `body` carries `{ personaId, lessonSlug }`.
    - Atoms `previewLessonSlugAtom` and `previewPersonaIdAtom`; the persona defaults to the org default from `usePersonas()`.
    - Changing either the lesson or the persona calls `setMessages([])`.
- Modify: `ai-training-page-container.tsx` (the `chat` section)
- Test: `src/routes/api/admin/__tests__/viper-preview-route.test.ts`, `src/lib/__tests__/library-lessons.test.ts`, `src/components/admin/ai-training/__tests__/preview-chat-container.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - `it('refuses non-admins')`: returns 403, and `buildChatStream` is not called.
  - `it('404s a persona from another org')`: `getPersonaById` returns `orgId: 999`. The response is 404, and `buildChatStream` is not called.
  - `it('tests the draft when there is one')`: `buildChatStream.mock.calls[0][0].persona` equals the draft. With `draftContent: null`, it equals `content`.
  - `it('never personalises or persists')`: the call has no `courseSlug`, `skaProfile`, `debriefGaps` or `openDebriefQuestions`, and `appendMessages` and `createChat` are not called.
  - `it('scopes search to the picked lesson')`: the injected `searchKBTool` came from `makePreviewSearchKBTool({ lessonSlug: 'crosswind-landings', ... })`.
  - `it('flattens, dedupes and sorts library lessons')`: a lesson in two places appears once, and the result is alphabetical.
  - `it('clears the conversation when the lesson changes')`: in the container, picking a second lesson calls the mocked `useChat`'s `setMessages` with `[]`.
  - `it('says why the input is disabled before a lesson is picked')`: the input's accessible name is `Pick a lesson to start`.
- [ ] **Step 2: Run** the three files. **Expected:** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three files plus `npx tsc --noEmit -p .`. **Expected:** PASS.
- [ ] **Step 5: Commit** `feat(admin): Viper preview chat: pick a lesson and persona, test drafts, nothing saved`

### Task 7: Sessions

**Files:**
- Create:
  - `src/db/viper-sessions.ts`:
    - `listViperSessions(page: number): Promise<{ sessions: SessionSummary[]; hasMore: boolean }>`, where `SessionSummary = { id; title; learnerName: string | null; updatedAt: Date; messageCount: number; isVideoCall: boolean }`.
      - Order by `ai_chats.updated_at desc`, 50 per page. Fetch 51 rows to compute `hasMore`.
      - Left join `user_profile` for `first_name || ' ' || last_name`.
      - The message count comes from a correlated subquery on `ai_messages`. Qualify the outer column explicitly, as in the drizzle-bare-column memory.
      - `isVideoCall` is an `exists` check on `video_calls.chat_id`.
    - `getViperSession(chatId: string): Promise<{ summary: SessionSummary; messages: { id; role; parts }[] } | null>`, with messages ordered by `order`.
  - `src/routes/api/admin/viper.sessions.ts` (GET, `?page=`, default 0, a non-negative integer, otherwise 400) and `src/routes/api/admin/viper.sessions.$chatId.ts` (GET; returns 404 when the session is null). Both are guarded.
  - `src/lib/viper-session-schemas.ts`: the zod response schemas, shared by the routes and the hooks.
  - `src/data-hooks/use-viper-sessions.ts` (`useViperSessions(page)`, `useViperSession(chatId | null)`, enabled when not null, `staleTime` 30s).
  - `src/components/admin/ai-training/sessions-list.tsx`, `session-transcript.tsx` (presentational; the transcript renders the text parts with `ChatMessage`), and `sessions-section-container.tsx` (atoms `sessionsPageAtom` and `selectedSessionIdAtom`).
- Modify: `ai-training-page-container.tsx` (the `sessions` section)
- Test: `src/db/__tests__/viper-sessions.test.ts` (query-shape test using `PgDialect`, as other db tests do), `src/routes/api/admin/__tests__/viper-sessions-route.test.ts`, `src/components/admin/ai-training/__tests__/sessions-list.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - `it('refuses non-admins')`: both routes return 403.
  - `it('shows an empty state')`: with no sessions, the list reads `No conversations yet.`
  - `it('404s an unknown chat')`.
  - `it('400s a bad page')`: `?page=-1` and `?page=x`.
  - `it('pages 50 at a time and reports hasMore')`: with 51 mocked rows, the response has 50 sessions and `hasMore: true`.
  - `it('counts messages of the outer chat, not every chat')`: the generated SQL's subquery references `"ai_chats"."id"`, qualified.
  - `it('marks video-call sessions')`: a row with `isVideoCall: true` shows the chip `Video call`.
  - `it('names a learner with no profile name')`: `learnerName: null` renders `Unnamed learner`, and `messageCount: 0` renders `0 messages`.
- [ ] **Step 2: Run** the three files. **Expected:** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three files plus `npx tsc --noEmit -p .`. **Expected:** PASS.
- [ ] **Step 5: Commit** `feat(admin): Sessions: read learners' Viper chats, video calls marked`

### Task 8: Whole-suite check and handoff

- [ ] **Step 1:** Run `npx tsc --noEmit -p .`. **Expected:** 0 errors.
- [ ] **Step 2:** Run `npx vitest run`. **Expected:** every file passes.
- [ ] **Step 3:** Run `npx biome check src/components/admin src/lib src/routes/api src/db src/ai`. **Expected:** no new errors.
- [ ] **Step 4:** Browser check on port 5001, read-only:
  - Open each of the four sections and check the nav on narrow and wide widths.
  - **Don't upload, delete or publish.** The database is prod.
  - The Chat preview may be sent one message, because it saves nothing.
- [ ] **Step 5:** Tell the user the rollout order: run `pnpm db:migrate-doc-source` against prod first, then merge and deploy.
