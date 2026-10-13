# Viper context compaction — design

Date: 2026-10-13

## Problem

Long Viper chats fail with Vercel's `FUNCTION_PAYLOAD_TOO_LARGE` (HTTP 413,
request body over ~4.5 MB), responses get slower as a chat grows, and the
Google Cloud bill shows ~390 input tokens per output token.

## Root cause (from the code)

1. **The client uploads the whole chat every turn.** `useChatWidget` posts the
   full `UIMessage[]` — including every tool result — to `/api/chat`, although
   the server already persists each turn to `ai_messages`.
2. **Every `searchKB` result contains the entire course.** `buildKBContext`
   returns `getCourseContentForAgent` (all gated lesson text + pro tips) + up
   to 5 KB chunks + every help topic. Each searching turn stores another full
   copy of the course in the chat's history.
3. **All of it is replayed to Gemini every turn**, up to 4 times per turn
   (`stepCountIs(4)` re-sends history on each tool step), behind a ~22 KB
   system prompt.
4. **Gemini's implicit prompt cache can never hit.** `viper7SystemPrompt`
   interpolates the current time to the second near its top (line ~230), so
   the prefix differs on every request.

Lesson material is **not** in the vector index today: `docs` holds only
uploaded documents (`generateHTMLEmbeddings` is called only from
`routes/api/ai-rag.ts`). The course dump is the sole path for lesson content,
and it is where subscription / level / lock gating is enforced.

## Goals

- No chat, however long, can produce a 413.
- Input tokens per turn stay roughly flat as a chat grows.
- Lower time-to-first-token, measurably.
- No regression in gating: a learner never receives content from a lesson
  they cannot open.
- The learner-visible transcript is unchanged.

## Decisions

- **A — Server owns history.** The client sends only the new message.
- **B — Prune old tool results** from model input (not from storage).
- **C — Embed lesson material** into `docs`; `searchKB` returns relevant
  chunks within the learner's allowed lessons, not the whole course.
- **D — Rolling summary** of older turns, stored on `ai_chats`, computed in the
  background.
- **E — Prompt caching** via Gemini implicit caching: stable-first prompt
  order, date-only timestamp.
- Re-searching is acceptable: Viper may lose raw KB passages from earlier
  turns and call `searchKB` again when needed.
- Out of scope: explicit Gemini `cachedContent` (the model is called through
  AI Gateway as `"google/gemini-3.6-flash"`, which exposes no Gemini cache
  option; implicit caching is automatic and free), embedding help topics.

## A. Server owns history

**Client** — `buildChatRequestBody` (`src/components/chat-widget/use-chat-widget.ts`)
sends `messages: [last message]` plus `id`, `trigger`, `messageId`, `chatId`,
`courseSlug`. Nothing in the repo uses `regenerate`, so `trigger` is always
`submit-message`.

**Route** — `chatHandler` (`src/routes/api/chat.ts`):

- `chatRequestSchema.messages` becomes `.length(1)`; the single message must
  have `role: 'user'`. Anything else is a 400.
- History comes from `loadChatContext` (section D) — never from the request.
  This also closes the existing hole where a client could inject fabricated
  assistant turns into the model's context.
- Persistence is unchanged: `appendMessages` of user + assistant in
  `onFinish`.

**Ordering (verified).** In `ai@6.0.168`, `createUIMessageStream`'s
`onFinish` is awaited inside the `TransformStream`'s `flush`, so the response
body closes only after `onFinish` resolves; the client cannot reach `ready`
(and send the next turn) before the assistant row is written. This holds only
while persistence stays **awaited** in `onFinish`; compaction (D) must not be.

## B. Prune old tool results

In `buildChatStream` (`src/ai/chat.ts`), after `convertToModelMessages(...)`
and `.filter(hasContent)`:

```ts
pruneMessages({ messages, toolCalls: 'before-last-message', emptyMessages: 'remove' })
```

(`pruneMessages` is exported by the installed `ai@6.0.168`.) Earlier turns
keep Viper's text; their tool calls and results go. The current turn's tool
loop is untouched. Because the history is only appended to and older turns
prune the same way every time, the pruned history is a stable prefix across
turns (needed by E).

`checkFlyability` receives the pruned `modelMessages` (it reads the latest
user text for ICAO/coordinates — unaffected).

Both `/api/chat` and the Tavus completions route go through `buildChatStream`,
so both benefit.

## C. Lesson embeddings

### Schema

`docs` gets `lesson_slug text NULL` (FK → `lessons.slug`, `ON DELETE
CASCADE`) and an index on it. Lesson chunks have `lesson_slug` set and
`course_id NULL` — a lesson can be placed in several courses, and gating is by
lesson, not course.

Applied with a hand-written `ALTER TABLE` (+ `CREATE INDEX`), **not**
`db:push` — `db:push` proposes truncating `docs` because of unrelated drift.

### Indexing

- The admin material save route (the only caller of `upsertLessonMaterial`,
  itself the only writer of `lesson_material`) re-embeds that lesson after the
  save commits, in the background via `waitUntil` (keeps `src/db/lesson.ts`
  free of AI imports):
  HTML of `text` + `proTips`, `sourcePath = lesson:<slug>`, via a lesson
  variant of `generateHTMLEmbeddings` that deletes/inserts by `lesson_slug`
  atomically. An embedding failure is logged and does not fail the material
  save (the previous chunks stay until the next successful re-index).
- One-time backfill (`src/db/migrate-lesson-embeddings.ts`, following the existing `migrate-*.ts` convention) indexes
  every existing `lesson_material` row; idempotent, safe to re-run.

### Gating

Extract the four filters in `getCourseContentForAgent`
(`src/db/course-content.ts`) — WIP, subscription, level visibility, per-lesson
locks — into:

```ts
getGatedCourseForAgent(slug, { userId }): Promise<GatedCourse | null>
// GatedCourse = { name, modules: { name, lessons: { slug, name, text, proTips }[] }[] }
```

The outline and the allowed slug set are derived from it by pure helpers
(`courseOutline`, `allowedLessonSlugs` in `src/lib/course-content.ts`).

`getCourseContentForAgent` is rewritten on top of it, so there is exactly one
gate. Fail-closed behaviour is preserved: unsubscribed non-author → empty;
missing course payload → throws (the tool reports no course content).

### searchKB

`searchKB(query, { courseId, lessonSlugs })`:

- documents: `lesson_slug IS NULL AND (course_id = courseId OR course_id IS NULL)`
  — or `course_id IS NULL` only when `courseId` is null. The explicit
  `lesson_slug IS NULL` is mandatory: lesson chunks also have
  `course_id NULL` and would otherwise leak into every org-wide search.
- lessons: `lesson_slug = ANY(lessonSlugs)`; skipped when the set is empty.
- top `KB_MAX_RESULTS` (5) across both, above `KB_MIN_SIMILARITY` (0.56).
  Re-measure the threshold against lesson chunks during implementation; it was
  calibrated on documents only.

`buildKBContext` returns: a compact course outline (module → allowed lesson
names), the retrieved chunks with their headings, and help topics (unchanged).
No course in context → no outline, no lesson chunks (as today).

## D. Rolling summary

### Storage

`ai_chats` gets `summary text NULL` and `summarized_through_order integer
NULL` (hand-written `ALTER TABLE`). Messages with `order <=
summarized_through_order` are represented by `summary`.

### Loading

`loadChatContext(userId, chatId)` (`src/db/chat.ts`) — ownership-checked like
`getChat` — returns:

```ts
{ summary: string | null; summarizedThroughOrder: number | null; messages: UIMessage[] }
```

`messages`: `user`/`assistant` rows with `order > summarized_through_order`,
capped at the last `HISTORY_HARD_CAP` (40) as a safety net for when
compaction is failing.

`viper7SystemPrompt` gains an optional `conversationSummary`, rendered as an
"Earlier in this conversation" section (position: see E).

### Trigger

In `onFinish`, after the awaited `appendMessages`:

- read the turn's first-step `usage.inputTokens` from `buildChatStream`'s
  result;
- if it exceeds `COMPACT_AT_INPUT_TOKENS` (start 20 000, tunable constant),
  schedule `compactChat(chatId)` with `waitUntil` from `@vercel/functions`
  (new dependency). Never awaited on the response path.

### compactChat

1. Load chat: summary, `summarized_through_order`, unsummarized messages.
2. Keep the last `KEEP_RECENT_MESSAGES` (6) verbatim; if nothing older
   remains, stop.
3. Convert the older ones with B's pruning (text only), then `generateText`
   with a small Gemini model through the gateway: previous summary + those
   turns → new summary (bounded length, ~400 words).
4. Summary keeps: learner's goals and situation, topics covered and
   conclusions reached, open questions, commitments Viper made, corrections
   the learner gave. It omits KB passages (re-search is fine) and never
   includes system/tool instructions.
5. Conditional write: `UPDATE ai_chats SET summary, summarized_through_order
   WHERE id = ? AND summarized_through_order IS NOT DISTINCT FROM <old>`.
   Zero rows updated → a concurrent compaction won; do nothing.

Failure anywhere → log and leave state unchanged; the next turn retries. The
hard cap keeps requests bounded meanwhile.

The summary is derived learner data on the chat row, so it is deleted with
the chat. It is never shown in the UI.

## E. Prompt caching

Gemini caches the longest previously-seen exact prefix automatically. Order
model input from most to least stable:

1. Static viper7 instructions (no interpolations).
2. Org persona sections.
3. Per-learner: user info, SKA profile.
4. Conversation summary (changes only at compaction).
5. Date line — **date only** (`yyyy-MMM-dd`), not time.
6. Then messages: pruned history, newest user message.

`isAssociate` / `toolName` and refusal prompts depend on subscriptions, which
are constant per user; they may stay where they are only if every
interpolation above them is per-org or static — otherwise move them down into
band 3. Voice mode appends `VOICE_MODE_PROMPT` + Tavus rules after band 5,
unchanged.

Nothing reads the time-of-day: `checkFlyability`'s `datetime` input is
already unused.

Instrumentation: log per turn `inputTokens`, `cachedInputTokens`,
`outputTokens`, and time-to-first-chunk (server-side), tagged with chat id
and step count, so the improvement is measured rather than assumed.

## Tavus completions route

`src/routes/api/tavus/v1/chat/completions.ts` switches from `getChat` +
`PRIOR_HISTORY_LIMIT` to `loadChatContext` and passes the summary through.
The file has the user's uncommitted changes at the time of writing — this is
the **last** task and waits until those are committed.

## Testing

Per CLAUDE.md, assert on what the consumer received:

- **A:** `buildChatRequestBody` output carries exactly one message; the route
  passes history from the (stubbed) `loadChatContext` to `buildChatStream` and
  ignores any extra client messages (400).
- **B:** `streamText`'s `messages` contain no tool parts from earlier turns
  and do contain the current turn's tool parts.
- **C:** the `docs` query receives `allowedSlugs` from the gate; a locked /
  out-of-level / unsubscribed lesson's slug is absent; an org-wide search
  excludes rows with `lesson_slug` set; `getCourseContentForAgent` output is
  unchanged for existing fixtures.
- **D:** `streamText`'s `system` contains the summary; messages at or before
  `summarized_through_order` are absent from `messages`; compaction's update is
  conditional and a lost race writes nothing; compaction is scheduled via
  `waitUntil`, not awaited.
- **E:** two `viper7SystemPrompt` calls seconds apart are byte-identical; the
  prefix through band 2 is identical across two different learners of one org.

Each regression test is confirmed red against the unfixed code before it is
kept.

## Rollout

Order matters, in both directions.

- Main's `searchKB` scopes with `isNull(docs.courseId)` /
  `or(eq(courseId), isNull(courseId))`. Lesson chunks have `course_id NULL`,
  so with the old code live they match every learner's search: locked,
  out-of-tier, unsubscribed and WIP lessons would leak.
- The new code selects/inserts `docs.lesson_slug` and the `ai_chats` summary
  columns. Deployed before the migration, `ensureChat`, `getChat`,
  `loadChatContext`, `searchKB` and doc ingest all 500.

1. Apply `pnpm db:migrate-viper-context` (hand-written SQL in
   `src/db/migrate-viper-context.ts`: `docs.lesson_slug` and the `ai_chats`
   columns) to the target DB, dev then prod, BEFORE merging or deploying.
   Merging to main may auto-deploy.
2. Merge and deploy; confirm the new code is live.
3. Only then run `pnpm db:migrate-lesson-embeddings` (dev, then prod). Until
   it runs, lessons have no chunks: degraded answers, but no leak.
4. Rollback: run `delete from docs where lesson_slug is not null` BEFORE
   reverting the code. Old code would otherwise serve lesson chunks ungated.
5. After the backfill, re-measure `KB_MIN_SIMILARITY` against lesson chunks
   (section C), watch the token/latency logs and Vercel 413s, and tune
   `COMPACT_AT_INPUT_TOKENS` from real numbers.
