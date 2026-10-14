# Mux Auto-Captions — Design

**Date:** 2026-10-14
**Status:** Approved in conversation; awaiting written-spec review.
**Project:** 2 of 2. It follows the shared video player (PR #30).

## Goal

Mux lesson videos get captions. The shared player shows CC for them, and
the lesson debrief, which needs a caption transcript, becomes available
for Mux lessons. Today Mux playback always returns `captions: null`, so
neither works.

## What the user asked for

- Mux auto-generated captions.
- CC and the debrief: captions feed the transcript that powers the
  debrief.
- Generation is triggered **automatically** when an admin attaches or
  changes a Mux video (primary or alternate), plus a **backfill** script
  for existing lessons. Admins see the status and can retry a failure.
- Readiness is learned by **checking on read**: no webhook.

## Facts from the Mux docs (2026-10-14)

- **Adding captions to an existing asset:**
  `POST /video/v1/assets/{ASSET_ID}/tracks/{AUDIO_TRACK_ID}/generate-subtitles`
  with body `{ "generated_subtitles": [{ "language_code": "en", "name": "English (generated)" }] }`.
- **Contract accounts:** assets older than 7 days need Mux support.
  Self-service accounts can call the API directly.
- **Languages.** Stable: `en es it pt de fr`. Beta: `pl ru nl ca tr sv
  uk no fi sk el cs hr da ro bg`. Generated captions are never
  translated: the language must match the audio.
- **Cost and speed:** no extra charge. Processing takes about 0.1× the
  content duration.
- **Readiness:** the text track (`text_source: "generated_vod"`) reaches
  status `ready`. The asset is playable before captions finish.
- **VTT URL:** `https://stream.mux.com/{PLAYBACK_ID}/text/{TRACK_ID}.vtt`.
  For signed playback it needs `?token=`, a JWT with the same `aud` as
  video playback.
- **Playback ID lookup:** `GET /video/v1/playback-ids/{PLAYBACK_ID}`
  returns the asset id.

## Current state

- **Credentials.** Mux credentials per course are a signing key only
  (`muxCredentialSchema`: `keyId`, `privateKey`). They are stored
  encrypted in `course_video_providers` and read by
  `resolveCourseProvider`.
- **Stored video ids.** Lessons store the Mux **playback ID**
  (`lessons.video_ref`, and `other_video_ids[].ref` for alternates),
  never the asset id.
- **Mux playback.** `resolvePlayback('mux', …)` in
  `src/lib/video-providers/resolve.server.ts` returns `captions: null`
  unconditionally.
- **Learner cache.** Learner playback is cached in Redis, with a TTL
  bounded by the signed URL's expiry (`src/db/lesson-playback.ts`).
- **Transcript.** `getLessonTranscript` (`src/db/lesson-transcript.ts`)
  fetches the playback's caption VTT, flattens it, and caches only
  successful transcripts. The debrief is offered when that transcript
  exists.
- **Video save routes.** Admin saves happen in
  `api/admin/lessons/$lessonId/video` and
  `api/admin/lessons/$lessonId/alternate-videos`.
- **Video languages.** Video languages are `en` plus the alternates
  `fr fr-CA es de pt-BR ja zh tr af ar hi`
  (`src/lib/video-languages.ts`).

## Design

### 1. Credentials

- `muxCredentialSchema` gains two optional fields, `apiTokenId` and
  `apiTokenSecret`. They must be provided together.
- They are stored encrypted with the rest of the course's Mux secrets.
- The how-to steps add: "Settings → Access Tokens → create a token with
  Mux Video read and write; paste the ID and secret."
- `validateCredentials('mux', …)`:
  - keeps the signing-key check;
  - when a token is present, also calls `GET /video/v1/assets?limit=1`
    with it, and reports "Mux rejected the API token" on 401/403.
- Without a token, the course still plays Mux video, but captions can't
  be generated for it. The admin section says so (§5).
- The credential form gains the two fields, marked optional. Saving
  credentials must not silently drop an existing token: the form either
  pre-keeps the stored token or requires both to be re-entered. The plan
  picks one and tests it.

### 2. Data: `video_captions`

| Column | Type | Note |
|---|---|---|
| `playback_id` | text, PK | Mux playback id (the stored `video_ref` / alternate `ref`) |
| `asset_id` | text, null | Resolved from the playback id |
| `track_id` | text, null | The ready or generating text track |
| `language_code` | text | Mux code requested (`en`, `fr`, `pt`, …) |
| `status` | text | `generating` · `ready` · `failed` · `unsupported` |
| `error` | text, null | Plain-words reason when `failed` |
| `checked_at` | timestamptz | Last time Mux was asked |
| `updated_at` | timestamptz | |

- Keyed by playback ID, not lesson: one Mux video can appear under
  several lessons and courses, and its captions are a property of the
  video.
- The table is added in `src/db/schema.ts`. It is created by a
  hand-written idempotent script, `pnpm db:migrate-video-captions`,
  following the existing `src/db/migrate-*.ts` pattern. Never use
  `db:push`: it wants to truncate the docs table.

### 3. Language mapping (pure)

`muxCaptionLanguage(lang: VideoLang): string | null`:
- `en` → `en`, `fr` and `fr-CA` → `fr`, `es` → `es`, `de` → `de`,
  `pt-BR` → `pt`, `tr` → `tr` (beta);
- `ja zh af ar hi` → `null`, which means unsupported.

The video's language is:
- `en` for the lesson's primary video;
- the alternate's `lang` for an alternate.

### 4. Server module: `src/lib/video-providers/mux-captions.server.ts`

It uses a Mux client built from the course's API token (`@mux/mux-node`,
already a dependency). Every Mux call has a 10s timeout.

**`requestMuxCaptions({ playbackId, lang, courseId })`**
1. If `muxCaptionLanguage(lang)` is `null`, upsert `unsupported` and
   return.
2. Load the course's Mux credentials. With no API token, return
   `{ status: 'no_token' }` and write no row.
3. `GET playback-ids/{id}` gives `assetId`. Then `GET assets/{assetId}`.
4. If a text track in that language already has status `ready`
   (generated or uploaded), upsert `ready` with that track and return.
   If one is `preparing`, upsert `generating` with it.
5. Otherwise find the audio track and call `generate-subtitles` with
   `{ language_code, name: "<Language label> (generated)" }`. Upsert
   `generating`.
6. On a Mux error, upsert `failed` with a plain message:
   - 401/403 → "Mux rejected the API token."
   - The 7-day contract limit → "Mux only captions videos older than 7
     days on request — contact Mux support."
   - Anything else → "Mux couldn't generate captions: <message>".

**`readMuxCaptions({ playbackId, courseId })`**
- Returns the row.
- If the status is `generating` and `checked_at` is more than 60s old,
  and the course has an API token, it first refreshes:
  `GET assets/{assetId}`, finds the track, and updates `ready` or
  `failed` plus `checked_at`.
- The refresh decision is a pure function:
  `shouldRefreshCaptions(row, now, hasToken)`.
- A refresh error is logged and the stale row is returned. Reading
  never throws.

### 5. Triggers

- **Video saved.** After the video or alternate-video save route
  succeeds for a Mux video, it calls `requestMuxCaptions` for that
  playback id and language, with the course the admin is acting in.
  - The call is awaited but wrapped. A captions failure is logged and
    stored, and never fails the save response.
  - Replacing a video requests captions for the new playback id. The old
    playback id's row stays, since another lesson may use it.
- **Retry.** `POST /api/admin/lessons/$lessonId/captions?courseId=&lang=`
  has the same admin guard as `video-playback`. It resolves that
  language's Mux playback id with `selectVideoForLang` and calls
  `requestMuxCaptions`. If that language's selected video is not Mux, it
  answers 409 with "Captions come from the provider for this video."
- **Backfill.** `pnpm db:backfill-mux-captions`:
  - walks every lesson's Mux primary and Mux alternates;
  - skips playback ids that already have a row;
  - requests captions through the first course that contains the lesson
    and has a Mux API token;
  - prints counts: requested, already ready, unsupported, failed, no
    token;
  - is idempotent and safe to re-run.

### 6. Playback and the debrief

- **Mux resolve.** `resolvePlayback('mux', ref, creds, …)` reads
  `readMuxCaptions`.
  - When `ready`, it returns
    `captions: { vtt: "https://stream.mux.com/{ref}/text/{trackId}.vtt?token=<the video token already signed>" }`.
  - Every other case returns `captions: null`.
  - A captions read error never affects playback.
  - The resolver needs the playback's course id (or credentials) to
    refresh. The plan threads it through the existing call path
    (`resolveSelectedLessonVideo` already has `courseId` and `creds`).
- **Learner cache.** While the row is `generating`, the learner playback
  Redis TTL is capped at 60s, so CC and the debrief appear within about
  a minute of Mux finishing.
  - This is a pure helper: `playbackCacheTtl(expirySeconds, captionsPending)`.
  - Other statuses keep today's TTL.
- **Debrief.** No change to the debrief. `getLessonTranscript` already
  fetches whatever VTT playback returns, and Mux lessons gain a
  transcript once captions are `ready`.
  - Correct the comments that say Mux has no text tracks: in
    `resolve.server.ts`, `lesson-transcript.ts` and
    `compute-transcript-debrief.ts`.
- **Expired caption token mid-session.** This is handled by Project 1.
  CC goes "unavailable", and the next URL refresh brings a new caption
  URL, which resets it.

### 7. Admin UI

In the lesson video section, for a Mux video, there is one captions
status line for the language being previewed. It is a presentational
`CaptionsStatus` with a container that reads a data hook.

| State | Copy | Action |
|---|---|---|
| `generating` | "Generating <Language> captions… usually a few minutes" | none |
| `ready` | "<Language> captions ready" | none |
| `failed` | "<Language> captions failed: <reason>" | **Retry** (Base UI Button) |
| `unsupported` | "Mux can't generate <Language> captions" | none |
| no API token | "Add a Mux API token to this course to generate captions" | link to the credential form |
| no row | "No captions yet" | **Generate captions** (same POST as Retry) |

- **Data.** `GET /api/admin/lessons/$lessonId/captions?courseId=&lang=`
  is admin-guarded. It calls `readMuxCaptions` and returns
  `{ status, error, hasToken }`.
- **Hook.** `useLessonCaptions({ lessonId, courseId, lang })` uses
  TanStack Query:
  - `refetchInterval` is 30s only while `generating`;
  - the retry mutation invalidates the captions query and the lesson
    playback query.
- Synthesia videos show no captions line, because their captions come
  from Synthesia.
- WCAG AA. Every non-ready state states its reason visibly. Logical CSS.

## Edge cases

| Case | Behaviour |
|---|---|
| Course without API token | Video plays. CC is disabled with its reason. The admin line explains, and the backfill counts it as "no token". |
| Unsupported alternate language | Row `unsupported`. CC is disabled. Mux is never called. |
| Asset already has a matching text track | Reused, with no generation call. |
| Same playback id in two lessons | One row, shared. |
| Mux API down during save | The save succeeds. Row `failed` with the reason, and Retry is available. |
| Token revoked after generation | Captions already `ready` still play: the VTT is signed with the signing key, not the token. |
| Generation never finishes | Stays `generating`. Each read refreshes at most once a minute. No timeout state (YAGNI). |

## Testing

- **Pure functions:**
  - `muxCaptionLanguage`, including the unsupported languages;
  - track selection from an asset's tracks (ready, preparing, wrong
    language, uploaded vs generated);
  - `shouldRefreshCaptions`;
  - `playbackCacheTtl`;
  - building the VTT URL.
- **`requestMuxCaptions` / `readMuxCaptions`.** With the Mux client and
  DB stubbed, assert on the calls made (consumer-side):
  - reuses a ready track;
  - generates when there is none;
  - stores each failure message;
  - skips without a token;
  - unsupported calls nothing;
  - refresh is throttled.
- **Mux resolve:** returns the token-signed VTT URL only when `ready`,
  and playback survives a captions read error.
- **Save routes:** a Mux save calls `requestMuxCaptions` with the
  playback id and language, and a captions failure doesn't fail the
  save.
- **Captions route:** the guard, `?lang=`, GET, and POST retry.
- **`CaptionsStatus` render tests:** every state's copy, and the
  retry/generate callbacks are received.
- **Credential schema and validation:** the token pair is
  all-or-nothing, and a 401 from the token check is reported.
- **Browser walkthrough** on port 5001, after you add a token:
  - attach a Mux video and watch the status reach ready;
  - CC plays;
  - the debrief is offered.

## Rollout

1. `pnpm db:migrate-video-captions` on prod before deploy. It is
   additive and idempotent.
2. Deploy.
3. You add a Mux API access token (Video read/write) to each course's
   Mux credentials.
4. `pnpm db:backfill-mux-captions`.

No new environment variables and no new dependencies.

## Out of scope

- Synthesia captions (they already exist).
- Choosing a caption language separately from the video language.
- Uploading or editing captions by hand.
- Mux webhooks.
- A "stuck generating" timeout.
