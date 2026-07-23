# Chat API (viper7) — Design

**Goal:** A streaming, tool-using RAG chat API for the 3D Airmanship app — an
agentic aviation assistant grounded in the course knowledge base, ported and
modernized from the old `airmanship-web` `/api/viper7` route.

**Architecture:** A single streaming TanStack Start route (`POST /api/chat`)
runs `streamText` on Gemini 3.6 Flash via the Vercel AI Gateway, with two tools
(`searchKB` retrieval, `checkFlyability` weather). It grounds answers in a DB
persona + user context, streams UI messages back, and persists the turn to
`aiChats`/`aiMessages`. Read endpoints list and load chats. **Backend only** —
the React chat UI is a separate follow-up task.

**Tech stack:** TanStack Start server handlers, AI SDK v6 (`ai@6`), Vercel AI
Gateway (bare model-id strings), `@ai-sdk/google` embeddings, Drizzle +
Postgres + pgvector, better-auth, zod.

## Global Constraints

- **Model:** `google/gemini-3.6-flash`, defined as one constant
  `geminiFlash` in `src/ai/ai-provider.ts` (single point to bump/rollback via
  the gateway). No provider SDK — the bare id routes through the gateway.
- **Auth:** every route self-gates with `auth.api.getSession({ headers })` →
  401 (the user-route pattern, not admin `requireAdmin`).
- **Persistence tables already exist and are AI-SDK-shaped:** `aiChats`
  (`id, userId, title, timestamps`), `aiMessages` (`id, chatId, role, parts
  json, order, createdAt`), `personas` (`id, name, content jsonb<Persona>`).
- **Embeddings model already exists:** `embeddingModel` in `src/ai/gemini.ts`
  (`gemini-embedding-001`, 3072-dim). Query embeddings use it directly.
- **Commit discipline:** explicit `git add <paths>`; never stage `src/env.ts`,
  `src/styles.css`, `src/utils/brand-colors.*`, `scripts/generate-theme-css.*`
  (env additions are applied but committed by the user).
- **No streaming exists in the repo yet** — this is the first streaming route.

## Scope

**In (this build — backend):**
- `POST /api/chat` streaming route (create-or-continue a chat)
- `streamText` on Gemini 3.6 Flash, `toolChoice: 'auto'`, `stopWhen:
  stepCountIs(4)` — **no toolSelector** (dropped; see Decisions)
- `searchKB` tool: pgvector cosine retrieval over `docs`, **enriched** with
  course-content HTML + help topics
- `checkFlyability` tool: ported metar-taf.com client (env-gated)
- System prompt built from a seeded `viper7` persona + user context
- Persist each turn to `aiChats`/`aiMessages` (auto-create chat + title)
- `GET /api/chats` (list), `GET /api/chats/:chatId` (load) + data-hooks
- New HNSW vector index on `docs.embedding`

**Out (later tasks):**
- React chat UI (`@ai-sdk/react` `useChat`, message/tool rendering, history
  sidebar) — the next task
- Langfuse / OTel tracing, rate limiting, Redis session IDs
- v5/v6 legacy-stream-compat shims (fresh v6 client, not needed)
- Multi-course scoping UI (v1 targets the `3d-airmanship` course)

## Key decisions (from brainstorming)

1. **Scope:** full viper7 parity — streaming + RAG + weather tool + persona +
   persistence.
2. **Model:** `google/gemini-3.6-flash` (latest Flash on the Gateway as of
   2026-07-21; pitched at agentic workflows with fewer model calls). Rollback
   to `google/gemini-3.5-flash` is a one-line id change.
3. **Tool orchestration:** **drop the toolSelector.** Two tools in distinct
   domains + a modern model → `toolChoice:'auto'` routes reliably without the
   extra round-trip. KB-grounding is enforced via the system prompt + the
   `searchKB` tool description ("call this first for course/airmanship
   questions"), not a forced selector step.
4. **searchKB output:** enriched — top-K RAG chunks **plus** course-content
   HTML **plus** help topics (both sources confirmed to exist here).
5. **Weather:** port the metar-taf.com client; env-gated (`METARTAF_API_KEY`,
   `METARTAF_API_VERSION`). Tool returns a clear "not configured" message until
   the key is present.
6. **Persona:** seed a `viper7` `personas` row; the assistant's voice is
   carried mainly by the ported system prompt (brand constants + quotes +
   structure), with the row supplying supplementary fields.

## Data flow (one turn)

```
POST /api/chat  { chatId?: string, messages: UIMessage[] }
  1. getSession → 401 if none
  2. parse body (zod): messages[], optional chatId
  3. parallel load: getPersona('viper7'), user roles + subscriptions
  4. system = viper7SystemPrompt({ persona, userInfo, isAssociate })
  5. createUIMessageStream({ execute: writer =>
       streamText({
         model: geminiFlash, system, messages: convertToModelMessages(messages),
         tools: { searchKB, checkFlyability },
         toolChoice: 'auto',
         stopWhen: stepCountIs(4),
         experimental_transform: [smoothStream(...), markdownJoinerTransform()],
       }).toUIMessageStream() → writer.merge
     })
  6. onFinish → persist: ensureChat(chatId, userId, autoTitle) +
       appendMessages(chatId, [lastUserMessage, assistantMessage])
  7. return createUIMessageStreamResponse({ stream })
```

## New / changed files

| Path | Responsibility |
|---|---|
| `src/ai/ai-provider.ts` | **add** `geminiFlash = "google/gemini-3.6-flash"` |
| `src/ai/prompts/brand.ts` | **new** — brand constants (name, ai name/callSign, websiteUrl, founder) ported from old repo |
| `src/ai/prompts/viper7.ts` | **new** — `viper7SystemPrompt({persona,userInfo,isAssociate})`, `viper7Quotes` (ported) |
| `src/ai/tools/search-kb.ts` | **new** — `searchKB` AI-SDK tool wrapping the retrieval + enrichment |
| `src/ai/tools/check-flyability.ts` | **new** — `checkFlyability` tool (ICAO extract + geolocation fallback) |
| `src/ai/chat.ts` | **new** — `buildChatStream({messages, persona, userInfo, writer})` → `streamText` config |
| `src/db/knowledge-base.ts` | **new** — `searchKB(query, {maxResults,minScore,courseId})` pgvector cosine query |
| `src/db/course-content.ts` | **new** — `getCourseContentForAgent(slug)` → HTML from lessons + lesson_material |
| `src/db/help-topics.ts` | **new** — `getAllHelpTopics()` |
| `src/db/persona.ts` | **new** — `getPersona(name)` |
| `src/db/chat.ts` | **new** — `ensureChat`, `appendMessages`, `listChats(userId)`, `getChat(userId, chatId)` |
| `src/db/seed-persona.ts` | **new** — seed the `viper7` `personas` row |
| `src/server/flyability.ts` | **new** — ported metar-taf.com client (`getNorthAmericaFlyData`, `flyDataToHtml`) |
| `src/routes/api/chat.ts` | **new** — `POST` streaming handler |
| `src/routes/api/chats.ts` | **new** — `GET` list user's chats |
| `src/routes/api/chats.$chatId.ts` | **new** — `GET` load one chat's messages |
| `src/data-hooks/use-chats.ts`, `use-chat-messages.ts` | **new** — TanStack Query read hooks |
| `src/env.ts` | **add** `METARTAF_API_KEY`, `METARTAF_API_VERSION` (user-applied) |
| `src/db/schema.ts` or migration | **add** HNSW index on `docs.embedding` |

## Component detail

### Retrieval — `searchKB` (`src/db/knowledge-base.ts`)
The only genuinely new primitive. Mirrors the old query with this repo's
`docs` table using Drizzle's `cosineDistance` (pgvector `<=>`):
```ts
const { embedding } = await embed({ model: embeddingModel, value: query });
const similarity = sql<number>`1 - (${cosineDistance(docs.embedding, embedding)})`;
const rows = await db
  .select({ chunk: docs.chunk, heading: docs.heading, similarity })
  .from(docs)
  .where(and(courseScope, gt(similarity, minScore)))  // courseScope = eq(courseId) OR isNull (org-wide)
  .orderBy((t) => desc(t.similarity))
  .limit(maxResults);
```
Add an **HNSW index** (`vector_cosine_ops`) on `docs.embedding` — today there is
only a btree on `course_id`.

The **tool** (`src/ai/tools/search-kb.ts`) runs the retrieval in parallel with
`getCourseContentForAgent('3d-airmanship')` and `getAllHelpTopics()`, then
returns a single concatenated string (RAG chunks + course HTML + help topics),
emitting a transient "Thinking…" notification via the writer (parity).

### Tools
- **`searchKB`** — input `{ query, maxResults?, minScore? }`; guards short
  queries; returns enriched context string.
- **`checkFlyability`** — input `{ lat?, lng?, icao?, datetime? }`; if no ICAO,
  extract from the last user message (small model call); if no coords, fall
  back to client geolocation in UI-message metadata; else request location.
  Calls the ported `getNorthAmericaFlyData` → `flyDataToHtml`. Returns
  `{ text, data }`. **Env-gated:** returns "weather not configured" if
  `METARTAF_API_KEY` is unset.

### System prompt + persona
Port `viper7SystemPrompt` (brand constants + `viper7Quotes` + structure +
in-prompt fallbacks) into `src/ai/prompts/viper7.ts`. Inject `getPersona('viper7')`
fields and `userInfo` (name, callSign, location, roles) + `isAssociate`
(subscription gating: associate-only users get the help-oriented framing).
`src/db/seed-persona.ts` inserts the `viper7` row (content from the old prompt
defaults; exact old-DB row values to be confirmed — see Open dependencies).

### Streaming
`createUIMessageStream` + `createUIMessageStreamResponse` (writer-based, to keep
transient notifications + tool-progress parts). `smoothStream({delayInMs:20,
chunking:'line'})` + a markdown-joiner transform (ported). No legacy compat.

### Persistence (`src/db/chat.ts`)
- `ensureChat(chatId?, userId, firstUserText)` → returns chatId; creates the
  `aiChats` row with an auto title (first ~60 chars of the first user message)
  when `chatId` is absent.
- `appendMessages(chatId, messages[])` → inserts `aiMessages` with incrementing
  `order` (max(order)+1); `parts` stored as the AI-SDK `UIMessage.parts` JSON.
- `listChats(userId)` → id/title/updatedAt, newest first.
- `getChat(userId, chatId)` → chat + ordered messages (ownership-checked).
Called from `onFinish`; a persistence failure is logged but does not break the
already-streamed response.

### Endpoints
- `POST /api/chat` — stream (above).
- `GET /api/chats` — `listChats(session.user.id)`.
- `GET /api/chats/:chatId` — `getChat(session.user.id, chatId)`; 404 if not
  owned/found.

### Env & deps
- Add to `src/env.ts`: `METARTAF_API_KEY`, `METARTAF_API_VERSION` (user adds
  values to `.env`).
- No new npm deps for the backend (`ai@6`, `@ai-sdk/google`, drizzle already
  present). `@ai-sdk/react` is deferred to the UI task.

## Deferred (v2+)
Tracing (Langfuse/OTel via `experimental_telemetry`), rate limiting, Redis
session IDs, the React chat UI, multi-course selection, "always-force searchKB"
grounding guarantee.

## Open dependencies / risks
1. **Persona row content** — the old persona lives in the old repo's DB, not its
   code. Voice is mostly carried by the ported prompt; the seed row will use the
   prompt's built-in defaults. If exact old-DB fidelity is wanted, extract that
   row (old DB) or the user supplies the JSON.
2. **Brand constants** — no `brand` config exists here; port name/callSign/
   websiteUrl/founder from the old repo into `src/ai/prompts/brand.ts`.
3. **Weather key** — `checkFlyability` is inert until `METARTAF_API_KEY` is set;
   the tool degrades gracefully.
4. **Gateway auth in the target runtime** — relies on ambient Vercel OIDC (no
   `AI_GATEWAY_API_KEY`); confirm streaming works in the deploy/runtime env.
5. **Gemini 3.6 Flash is 2 days old** — rollback path is the one-line model id.
6. **HNSW build** — index creation on a large `docs` table is a one-time cost;
   run via migration.

## Testing strategy
- **Pure/unit (no network):** `searchKB` SQL shape via a seeded-row DB check
  (like the course-progress verification); `ensureChat`/`appendMessages`
  ordering; `viper7SystemPrompt` output for associate vs candidate + userInfo
  injection; ICAO extraction fallback logic; chat endpoints (401/400/list/load/
  404) with mocked db + auth (the established route-test pattern).
- **Streaming route:** unit-test the handler's auth/parse guards with a mocked
  `buildChatStream`; a smoke check that it returns a stream Response.
- **Live smoke (manual/scratch):** a scratch script hitting `buildChatStream`
  against the dev DB with a real embedded query to confirm gateway streaming +
  retrieval end-to-end (cleaned up after), mirroring the course-progress
  verification approach.
```
