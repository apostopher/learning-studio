import { canOfferDebrief } from '#/lib/debrief-offer';
import type { PlaybackResult } from '#/lib/video-providers/resolve.server';

/**
 * Whether this lesson's video has a caption track — the transcript the debrief
 * would be generated from (see `resolveDebriefSource`).
 *
 * The playback response already answers this, so availability costs no extra
 * request and no AI call on the page's critical path. A Mux video
 * reports `captions: null` until its auto-generated captions are ready
 * (`#/db/video-captions`), so it correctly offers nothing in the meantime.
 *
 * Deliberately conservative while playback is still resolving: `undefined`
 * answers false, so the debrief appears once it is known to work rather than
 * flickering in and back out.
 */
export function playbackHasCaptions(
  video: PlaybackResult | undefined,
): boolean {
  if (video?.status !== 'ready') return false;
  return video.captions !== null;
}

export type TranscriptDebriefSectionArgs = {
  /** `lessons.has_debrief` — the admin's switch, authoritative as everywhere else. */
  hasDebrief: boolean;
  /** See `playbackHasCaptions`. */
  transcriptUsable: boolean;
  /** Completed at an earlier level — no debrief clock (call 12). */
  readOnly: boolean;
};

/**
 * Whether a lesson with NO material row shows the debrief on its own below
 * the player. The shared `canOfferDebrief` rule with no body text — which is
 * what "no material row" means — so it can only come from the transcript.
 */
export function showsTranscriptDebriefSection({
  hasDebrief,
  transcriptUsable,
  readOnly,
}: TranscriptDebriefSectionArgs): boolean {
  return (
    !readOnly &&
    canOfferDebrief({ hasDebrief, materialText: null, transcriptUsable })
  );
}
