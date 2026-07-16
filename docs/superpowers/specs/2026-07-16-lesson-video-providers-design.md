# Lesson Video Providers (Mux + Synthesia) — Design

**Date:** 2026-07-16
**Status:** Approved (pending spec review)

## Goal

Let an admin attach a video to a lesson by pasting a URL. Detect the provider
(Mux or Synthesia) from the URL, show provider-specific "how to connect"
guidance, and capture the per-course credentials the app needs to play the
video. Preview the resolved video in the admin config modal.

## Scope

**In scope (this build):**

- Provider registry abstraction (Mux, Synthesia).
- Per-course encrypted credential storage (`course_provider_credentials`).
- AES-256-GCM encryption utility.
- Lesson video reference model (`video_provider` + `video_ref`).
- The Video-section UI in the lesson config modal: paste URL → detect →
  how-to + credential entry (per course) → save → **admin preview player**.
- Server playback resolution for the admin preview.

**Out of scope (follow-on):**

- Learner-side Mux player rendering + signed-token endpoint (the app currently
  renders only Synthesia to learners).
- Backfilling existing `lessons.video_id` (uuid) → `video_provider='synthesia'`,
  `video_ref=video_id`.
- Multi-clip (`other_video_ids`) multi-provider support.
- Mux dashboard/asset URL resolution (needs a Mux API token). We accept the
  **playback URL / playback id** only.

## Confirmed decisions

- **Credential scope:** per **course**. Each course stores its own Mux +
  Synthesia credentials; a lesson's video resolves via its course's creds.
- **Mux playback:** **signed** (access-controlled). App mints short-lived JWTs.
- **Encryption:** app-level **AES-256-GCM**, 32-byte master key in env
  `CREDENTIALS_ENCRYPTION_KEY`. Secrets never returned to the client.
- **Mux signing:** official **`@mux/mux-node`** SDK (`Mux.JWT.signPlaybackId`).

## Provider abstraction

`src/lib/video-providers/` — a registry so providers are pluggable and the DB
and UI stay provider-agnostic.

```ts
type ProviderId = 'mux' | 'synthesia';

interface VideoProvider {
  id: ProviderId;
  label: string;
  /** Detect this provider + extract the normalized ref from a pasted URL. */
  detect(url: string): { ref: string } | null;
  /** Zod schema for the credential fields the admin enters. */
  credentialSchema: ZodType;                 // e.g. { apiKey } / { keyId, privateKey }
  /** Non-secret projection for display ("configured" state) — never the secret. */
  credentialDisplay(creds): Record<string, unknown>;  // e.g. { keyId } / { apiKeyLast4 }
  /** Lightweight "test connection" — returns ok/err. */
  validateCredentials(creds): Promise<{ ok: boolean; error?: string }>;
  /** Server-only. Returns a short-lived playable URL for `ref`. */
  resolvePlayback(ref, creds): Promise<{ url: string; kind: 'hls' | 'file'; expiresAt: number | null }>;
  /** Static setup guidance (title + ordered steps). */
  howTo: { title: string; steps: string[] };
}
```

### Synthesia provider

- **detect:** `share.synthesia.io/<uuid>`, `api.synthesia.io/v2/videos/<uuid>`,
  or a bare UUID → `ref = uuid` (reuse/adapt `getVideoIdFromURL`, validate UUID).
- **credential:** `{ apiKey }`. meta: `{ apiKeyLast4 }`.
- **validate:** `GET /v2/videos?limit=1` with the key → 200.
- **resolvePlayback:** reuse `getVideoDetails(ref, apiKey)` → signed `download`
  URL, `kind:'file'`, `expiresAt` from the URL's `Expires`. Redis-cacheable.

### Mux provider

- **detect:** `stream.mux.com/<playbackId>.m3u8` (strip extension + query) or a
  bare playback id → `ref = playbackId`. Dashboard/asset URLs are rejected with
  a hint (needs the stream URL / playback id).
- **credential:** `{ signingKeyId, signingKeyPrivate }` (private key is the
  secret; keyId is a non-secret identifier). meta: `{ keyId: signingKeyId }`.
- **validate:** sign a throwaway JWT for a dummy playback id → success means the
  key parses/signs (structural check; full validity is confirmed on first play).
- **resolvePlayback:** `Mux.JWT.signPlaybackId(ref, { keyId, keySecret, expiration })`
  → `https://stream.mux.com/<ref>.m3u8?token=<jwt>`, `kind:'hls'`, `expiresAt`.

## Data model (schema.ts — user runs `pnpm db:push`)

**New table `course_video_providers`:**

```
id                integer pk
course_id         integer FK -> courses(id) on delete cascade
provider          text        -- 'mux' | 'synthesia' (plaintext; for uniqueness + listing)
secrets           jsonb        -- AES-GCM envelope: { v, iv, tag, ct } (all base64)
last_validated_at timestamp    -- nullable
created_at, updated_at timestamps
unique(course_id, provider)
```

- `secrets` is the **encryption envelope**, not plaintext. `ct` is the
  encrypted provider payload JSON — `{ apiKey }` (Synthesia) /
  `{ keyId, privateKey }` (Mux). At rest the jsonb is opaque; a single code
  path (`resolveCourseProvider`) loads the row, decrypts `secrets`, and hands
  the payload to the provider's signer.
- `provider` is the only plaintext column (non-secret) — required for the
  unique constraint (can't index a field inside the ciphertext).
- No separate `meta` column: the credentials GET decrypts server-side and
  projects only non-secret display fields (Mux `keyId`, Synthesia `apiKey`
  last-4). Providers are few and admin-only, so decrypt-on-read is fine.

**Lessons — add columns:**

```
video_provider  text   -- 'mux' | 'synthesia' | null
video_ref       text   -- normalized provider id | null
```

New videos write `(video_provider, video_ref)`. Existing `video_id` /
`other_video_ids` are left as-is (backfill is follow-on). `isConfigured`
(board payload) switches to `video_ref IS NOT NULL OR video_id IS NOT NULL`.

## Encryption (`src/lib/crypto.server.ts`)

- AES-256-GCM. Key = base64-decoded `CREDENTIALS_ENCRYPTION_KEY` (32 bytes).
- `encryptJson(value) -> { v: 1, iv, tag, ct }` (base64) — the jsonb envelope.
- `decryptJson(envelope) -> value`.
- 12-byte random IV per encryption. Server-only module. The `v` field allows a
  future key-version prefix for rotation.
- Env: `CREDENTIALS_ENCRYPTION_KEY` (required). Generate:
  `openssl rand -base64 32`.

## Security

- Secrets encrypted at rest; **never** returned to the client. The credentials
  GET returns only `{ provider, configured: true, display, lastValidatedAt }`
  where `display` is a non-secret projection (Mux keyId, Synthesia key last-4).
- Credential inputs are **write-only** ("Replace credential" to change).
- Decryption happens only inside `resolvePlayback` / `validateCredentials`,
  server-side.
- All endpoints `requireAdmin`. Playback tokens are short-TTL.
- No secret is ever logged.

## API endpoints (all admin-guarded)

- `GET  /api/admin/courses/$courseId/credentials`
  → `[{ provider, configured, display, lastValidatedAt }]` (no secrets;
  `resolveCourseProvider` decrypts server-side, returns display projection).
- `PUT  /api/admin/courses/$courseId/credentials/$provider`
  → validate → encrypt → upsert. Body = provider credential fields.
- `DELETE /api/admin/courses/$courseId/credentials/$provider` → remove.
- `PUT  /api/admin/lessons/$lessonId/video`
  → body `{ provider, ref }` (client detects; server re-validates the URL/ref
  shape), stores `video_provider` + `video_ref` on the lesson.
- `GET  /api/admin/lessons/$lessonId/video-playback`
  → resolve via the course's creds → `{ url, kind, expiresAt }` (short-lived).
  Redis-cache by expiry.

## Admin Video-section UI (config modal Video tab)

Layout: a 16:9 **preview** on top (placeholder with a play/video icon until a
video is resolved; player once resolved) + a **URL form** below.

Flow:

1. Paste video URL → client runs `detect()` across providers → shows the
   detected provider (or an "unsupported URL" hint).
2. On confirm: `PUT …/lessons/:id/video` with `{ provider, ref }`.
3. If the course **has** creds for that provider → fetch
   `…/video-playback` → render the preview player.
4. If the course **lacks** creds → render that provider's **how-to** + a
   **credential form** (fields from `credentialSchema`) with a **Test** action;
   on save (`PUT …/credentials/:provider`), re-resolve → preview.

Credential entry is thus **one-time per (course, provider)**: step 4 fires only
until the course has that provider's creds; afterwards adding a video for that
provider goes straight to the preview.

Preview player: HLS-capable `<video>` (hls.js for `.m3u8`; native for Synthesia
`file`). hls.js is a new client dep (lazy-loaded, admin-only).

### Credential management in the course edit dialog

The same credential form is also surfaced persistently in the **course edit
dialog** as a "Video integrations" section: lists each provider with its
configured state (via the credentials GET `display`), and lets the admin
**add / update / remove** credentials anytime — reusing
`PUT`/`DELETE …/courses/:id/credentials/:provider`. This is the durable place to
rotate keys; the contextual step-4 form is just a convenience for the first
video.

## Dependencies / env

- `@mux/mux-node` (server) — JWT signing. Subject to the 7-day release-age gate.
- `hls.js` (client, lazy) — admin preview HLS playback.
- env: `CREDENTIALS_ENCRYPTION_KEY` (required, 32-byte base64).

## Component / file structure

- `src/lib/crypto.server.ts` — AES-GCM encrypt/decrypt.
- `src/lib/video-providers/{index,types,mux,synthesia}.ts` — registry + providers.
- `src/db/schema.ts` — new table + lesson columns.
- `src/db/admin.ts` — `course_video_providers` CRUD (encrypt/decrypt via
  crypto.server), `resolveCourseProvider(courseId, provider)`, setLessonVideo,
  resolveLessonPlayback.
- `src/routes/api/admin/courses.$courseId.credentials(.$provider).ts`,
  `lessons.$lessonId.video.ts`, `lessons.$lessonId.video-playback.ts`.
- `src/lib/admin-schemas.ts` — credential + set-video zod (client-safe: no
  secrets in the board payload).
- `src/data-hooks/` — `use-course-credentials`, `use-set-lesson-video`,
  `use-lesson-video-playback`, `use-save-credential`.
- `src/components/admin/lesson-config/video-section-container.tsx` (+
  presentational `video-preview`, `video-url-form`, `provider-credential-form`,
  `provider-how-to`).
- `src/components/admin/course-video-integrations-container.tsx` — the
  persistent add/update/remove-credentials section rendered in the course edit
  dialog (reuses `provider-credential-form` / `provider-how-to`).

## Testing

- Unit: `crypto.server` round-trip; each provider `detect()` (valid/invalid
  URLs); Mux JWT shape; Synthesia validate/resolve (mock fetch).
- Integration: credential PUT encrypts + never echoes secret; video-playback
  resolves and 404s without creds.

## Open questions / follow-ons

- Learner-side Mux playback (separate build).
- Backfill existing Synthesia `video_id` data.
- Credential-key rotation (start single-key; add key-version prefix later).
