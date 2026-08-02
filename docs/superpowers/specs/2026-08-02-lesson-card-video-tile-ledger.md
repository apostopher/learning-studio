# Shared understanding: lesson-card video tile

## Goal

Replace the lesson card's status dot with a 16:9 video tile, and let an admin
play a lesson's video from the board without opening the lesson editor.

## Decisions

| #   | Decision | Chosen | Rationale |
| --- | -------- | ------ | --------- |
| D1  | Real poster frame or an affordance? | **Affordance**, rendered from `isConfigured` | At 32px tall the tile is ~57×32 — a real frame there is a smudge that can only communicate "a video exists", which `isConfigured` already carries for free. Real posters would turn `getCourseBoard` from one DB read into up to 102 provider resolutions (an HTTP call per Synthesia lesson), refreshing hourly as Mux's 1h poster tokens expire, on a board that is not virtualized |
| D2  | Where does published/WIP go? | A **"Draft" badge** beside the lesson name, only when unpublished | The dot was the board's only draft cue and is `aria-hidden`, so today the distinction is invisible to a screen reader. A word fixes that. Most lessons end up published, so the badge is usually absent and costs nothing |
| D3  | What plays in the modal? | The existing **`VideoPreview`** (`lesson-config/video-preview.tsx`) | Already 16:9, already owns hls.js attach/teardown, already renders a placeholder for rendering/failed/absent playback, and already has `onForbidden` for a revoked Mux key. Crucially it is NOT the learner container, so no `useMilestoneReporter` — an admin preview must not write `videos_progress` rows |
| D4  | When does playback resolve? | Only while the modal is open (`enabled`) | Resolving on render would fire a provider call per lesson on every board load |
| D5  | Who owns the modal? | A container, not the card | `LessonCard` is presentational and renders once per lesson plus once more in the drag overlay. It takes `onPlay?: () => void`; the container holds which lesson is playing |
| D6  | Is the no-video tile clickable? | **No** — static, muted, not focusable | It would open a modal that can only show a placeholder. An affordance that looks playable and isn't is the lying-control case the UX rules already forbid |
| D7  | What "frameless" still includes | `sr-only` `Dialog.Title` with the lesson name; Escape and backdrop click; a visible close control | A dialog with no visible exit is a trap for anyone who does not know Escape, and an unnamed dialog is unusable with a screen reader |
| D8  | Hit target | Visual tile stays 32px; padding takes the hit area to 44px | The repo holds this bar deliberately (see `binary-toggle.tsx:71`). Padding does not change the drawn size, so the spec is unaffected |

## Failure behaviour

| Scenario | What happens | Admin sees |
| -------- | ------------ | ---------- |
| Lesson has no video | Static muted tile, not interactive | Video icon, no hover, no pointer |
| Video assigned, provider credentials missing | Modal opens, playback resolution 404s | The placeholder plus the same error copy the config section uses |
| Video still rendering | `VideoPreview` renders its placeholder | Video icon; no broken player |
| Mux signing key revoked | `onForbidden` fires from hls.js | Surfaced as it is in the config section |
| Native-HLS browser (Safari) with a revoked key | `onForbidden` cannot fire — the media error carries no status | A player that fails silently; pre-existing, documented in `VideoPreview` |
| Board is dragged while a modal is open | Modal is owned by the container, not the dragged card | Unaffected |

## Accepted risks

- **The tile promises "a video is assigned", not "it will play".** `isConfigured`
  is `videoRef !== null` and the board knows nothing about course credentials,
  so a tile can open a modal that cannot resolve. Surfacing credential state on
  the board would mean loading provider config per course into the board query.
- **`isConfigured` and `hasVideo` disagree slightly.** The board's is
  `videoRef !== null`; the gate's is `videoProvider !== null && videoRef !== null`.
  A row with a ref but no provider would show a play tile and fail to resolve.
  Pre-existing; not introduced here.

## Out of scope

- The learner-facing player and the video-assign flow.
- Persisting real poster URLs at assign time (the alternative to D1) — revisit
  if the tile ever needs to distinguish one video from another.

## Open

| Deferred | Trigger |
| -------- | ------- |
| The board still cannot show that a course's provider credentials are missing | An admin reports tiles that open and fail |
