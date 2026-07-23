# Chat Widget UI — Design

**Goal:** A global, floating, draggable/resizable chat widget (viper7) for the
3D Airmanship app: a bubble that opens an OS-style window with streaming text
chat and push-to-talk voice input, ported and modernized from the old
`airmanship-web` `chat-widget`.

**Architecture:** A single always-mounted overlay in `__root.tsx` toggles
between a trigger bubble and a free-floating `motion.div` window whose
position/size ride a hand-rolled geometry hook. The window streams from the
existing `POST /api/chat` via `@ai-sdk/react`'s `useChat`, captures the
`x-chat-id` header so a session's turns persist to one `aiChats` row, and
supports push-to-talk voice via a new `POST /api/chat/transcribe` endpoint
(Gemini multimodal audio → text).

**Tech stack:** React + TanStack Start, `@ai-sdk/react` `useChat`, `ai@6`
`DefaultChatTransport`, motion (drag/spring), jotai (open + font-size atoms),
`use-stick-to-bottom` (auto-scroll), `react-markdown` (message rendering),
better-auth (`authClient.useSession`), the app's `--color-accent-9`/theme
tokens + `cn` (`#/lib/cn`), Gemini via the Vercel AI Gateway.

## Global Constraints

- **Presentational vs container:** presentational components are hookless pure
  functions returning JSX (repo rule + the render-test constraint: react-compiler
  nulls the hook dispatcher, so hook-using components are NOT render-tested).
  Container/logic hooks are tested via `renderHook` where they don't need the
  dispatcher, and the ported pure geometry/recorder/PTT helpers are unit-tested.
- **Base UI first** for standard controls (buttons, tooltip); the draggable
  OS-window itself is a justified custom component (no Base UI equivalent).
- **Logical CSS properties** (`inset-inline`, `ms-`/`me-`, etc.), theme tokens
  (`--color-accent-9`, gray scale) — never the old repo's `bg-interactive-*`/
  `surface-page` tokens or hardcoded colors.
- **File naming:** kebab-case; components PascalCase inside.
- **Model:** transcription uses the shared `geminiFlash` constant
  (`google/gemini-3.6-flash`) via the gateway (bare id string).
- **Auth:** the transcribe route self-gates with `auth.api.getSession` → 401.
- **Commit discipline:** explicit `git add` paths; never stage `src/env.ts`,
  `src/styles.css`, `src/utils/brand-colors.*`, `scripts/generate-theme-css.*`.
- **Session-scoped persistence:** the widget captures `x-chat-id` from the
  `/api/chat` response and echoes it as `chatId` on subsequent turns.

## Scope

**In (v1):**
- Global floating bubble ↔ draggable + resizable window (spring transitions)
- Streaming text chat via `useChat` → `POST /api/chat`; markdown rendering;
  "Thinking…" tool-notification rendering; auto-scroll
- Push-to-talk voice: record → `POST /api/chat/transcribe` → insert transcript
- `x-chat-id` multi-turn persistence (one `aiChats` row per session)
- Font-size toggle; mounted in `__root.tsx`, gated on signed-in, hidden on
  admin routes
- New backend: `POST /api/chat/transcribe`

**Out (deferred):**
- History-browsing UI (conversation list / switcher). Persistence still happens
  in the DB via `x-chat-id`; only the browsing UI is deferred. No auto-resume
  across page loads.
- Geolocation auto-round-trip for flyability (works via ICAO codes in-message).
- Legacy v5/v6 stream-compat shims (fresh v6 client).

## Key decisions (from brainstorming)

1. Full parity: window + push-to-talk voice + session persistence; **no history
   UI** for now.
2. Transcription on the **latest** model (`geminiFlash` = `google/gemini-3.6-flash`).
3. Port the **tested** hooks (`use-chat-window-geometry`, `use-audio-recorder`,
   `use-push-to-talk`) with their tests rather than reinvent.

## Backend — `POST /api/chat/transcribe`

Port of `airmanship-web/src/app/api/chat/transcribe/route.ts`, adapted:
- Clerk `auth()` → `auth.api.getSession({ headers })` → 401.
- `req.formData()` → `audio` `Blob`: 400 on invalid form / missing / empty /
  `> 20MB`.
- `generateText({ model: geminiFlash, messages: [{ role: 'user', content: [
  { type: 'text', text: TRANSCRIBE_PROMPT }, { type: 'file', data: bytes,
  mediaType: audio.type || 'audio/webm' } ] }] })` → `{ transcript: text.trim() }`.
- `TRANSCRIBE_PROMPT` (verbatim transcription, no commentary) ported.
- **Verify** `google/gemini-3.6-flash` accepts audio file input; if a specific
  Flash tier is required for audio, fall back to `google/gemini-2.5-flash` and
  note it (the model id is one constant to change).
- Route: `createFileRoute('/api/chat/transcribe')({ server: { handlers: { POST } } })`.

## Frontend

### Dependencies to add
`@ai-sdk/react` (`useChat`), `use-stick-to-bottom` (message auto-scroll),
`react-markdown` + `remark-gfm` (assistant markdown). (`ai`, `motion`, `jotai`,
`sonner` already present.)

### Components / hooks (port from `airmanship-web/src/components/chat-widget/`)

| New path (`src/components/chat-widget/`) | Ported from | Notes / adaptations |
|---|---|---|
| `chat-widget.tsx` | same | container: bubble ↔ window overlay; `authClient.useSession()` gate; hide on admin via router location; mounts font-size + open atoms |
| `chat-window.tsx` | same | `motion.div`, geometry hook, composes parts; theme tokens |
| `chat-widget-header.tsx` | same | drag handle + reset + font-toggle + close (Base UI buttons + tooltip) |
| `chat-widget-messages.tsx` | same | `use-stick-to-bottom`; renders parts |
| `chat-message.tsx` | old `ui/chat-message` | `react-markdown` renderer + "Thinking…" notification part |
| `chat-widget-input.tsx` | same | textarea + send + mic; wires recorder/PTT → transcript → `onSend` |
| `chat-widget-mic-button.tsx` | same | PTT button states |
| `chat-widget-resize-handles.tsx` | same | 8 handles → `getResizeHandleProps` |
| `message-circle.tsx` | same | bubble icon (or Lucide `MessageCircle`) |
| `use-chat-widget.ts` | same | jotai open atom + `useChat` transport → `/api/chat`; capture `x-chat-id`; `onData` → notification/error toasts (drop geolocation branch); `sonner` toasts |
| `use-chat-window-geometry.ts` (+test) | same | pure helpers (`computeDefaultRect`, `computeResize`, clamping) + hook; no Next deps |
| `use-audio-recorder.ts` (+test) | same | MediaRecorder webm/opus → POST FormData to `/api/chat/transcribe` → `{ transcript }` |
| `use-push-to-talk.ts` (+test) | same | hold-to-record UX + cancel reasons |

### `useChat` wiring (`use-chat-widget.ts`)
```ts
useChat({
  id: 'viper7-widget',
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  onData: (data) => { /* AIWriterDataSchema: data-notification → (rendered);
                         error → sonner toast. Geolocation branch DEFERRED. */ },
  onError: (e) => toast.error(e.message),
})
```
- **`x-chat-id`:** read the response header (via the transport's response hook /
  `onResponse`) and store it in a ref/atom; include it as `chatId` in the body
  of the next `sendMessage` (through `prepareSendMessagesRequest` or transport
  body). This keeps all of a session's turns in one `aiChats` row.
- `AIWriterDataSchema` + `AIWriterDataNotificationSchema` already exist in
  `src/types.ts` — reuse them.

### Mounting & gating (`__root.tsx`)
Mount `<ChatWidget />` inside `RootDocument` (within `TanstackQueryProvider` +
`Tooltip.Provider`, alongside `{children}`). Render nothing when
`!session` or when the current route is under `/admin` (router location /
`_authed/admin*`).

### Voice flow
`chat-widget-input` + `chat-widget-mic-button` → `use-push-to-talk` (hold) →
`use-audio-recorder` (record webm/opus, POST to `/api/chat/transcribe`) →
`{ transcript }` → `onSend(transcript)` (same path as typed input). Errors
(`transcription-failed`, permission denied) → toast.

## Deferred (v2+)
History list/switcher UI, cross-page-load resume, geolocation round-trip, voice
streaming/partial transcripts, message editing/regeneration.

## Open dependencies / risks
1. **Gemini 3.6 Flash audio support** — verify it transcribes webm/opus file
   parts; fall back to `google/gemini-2.5-flash` if not (one-line model change).
2. **`x-chat-id` capture in `useChat`** — the exact ai@6 transport hook to read a
   response header + inject `chatId` into the next request body must be found in
   the `@ai-sdk/react`/`ai` types (`DefaultChatTransport` options /
   `prepareSendMessagesRequest`). If not cleanly supported, fall back to a custom
   `fetch`-based transport.
3. **MediaRecorder support** — recorder degrades gracefully when unavailable
   (mic button disabled); ported hook already guards this.
4. **Render-test limits** — hook-using presentational components can't be
   render-tested; coverage focuses on the ported pure hooks/helpers + the
   transcribe route handler.

## Testing strategy
- **Ported pure/logic hooks** (with their ported tests): `use-chat-window-geometry`
  (compute/clamp/resize math), `use-audio-recorder` (state machine, mocked
  MediaRecorder + fetch), `use-push-to-talk` (hold/cancel state).
- **Transcribe route:** vitest handler test (401 no session, 400 invalid form /
  missing / empty / oversize, 200 returns `{ transcript }` with `generateText`
  mocked) — the established route-test pattern.
- **Presentational components:** not render-tested (hook dispatcher constraint);
  keep them hookless and thin.
- **Live smoke (manual):** run the app, open the widget, send a text message
  (stream renders), hold-to-talk and confirm a transcript is inserted and sent,
  confirm turns persist to one `aiChats` row (`x-chat-id`).
