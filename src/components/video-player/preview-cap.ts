import type { VideoPreview } from './types';

/**
 * The rules of a preview (a free seat on a paid lesson plays only the
 * opening), pure so they can be tested without rendering the player.
 *
 * On Mux the stream itself ends near the cap; these hold the player to the
 * cap exactly, and are the only cap on a Synthesia file.
 */

/** Slack for "at the cap": `timeupdate` lands every ~250ms. */
const CAP_EPSILON_SECONDS = 0.25;

/** A seek target, held inside the preview. */
export function clampToPreview(
  time: number,
  preview: VideoPreview | undefined,
): number {
  return preview ? Math.min(time, preview.seconds) : time;
}

/** Whether playback has reached the cap and must stop there. */
export function hasReachedPreviewCap(
  currentTime: number,
  preview: VideoPreview | undefined,
): boolean {
  return preview !== undefined && currentTime >= preview.seconds;
}

/** Where Play should start from: back to 0:00 once the preview is used up. */
export function previewPlayFrom(
  currentTime: number,
  preview: VideoPreview | undefined,
): number | null {
  return preview && currentTime >= preview.seconds - CAP_EPSILON_SECONDS
    ? 0
    : null;
}

/** The length the clock and scrubber show: the whole video, when known. */
export function displayDuration(
  mediaDuration: number,
  preview: VideoPreview | undefined,
): number {
  return preview?.fullDurationSeconds ?? mediaDuration;
}

/** Paused at the cap: the moment to say the preview is over and why. */
export function isPreviewEnded(
  playback: { paused: boolean; currentTime: number },
  preview: VideoPreview | undefined,
): boolean {
  return (
    preview !== undefined &&
    playback.paused &&
    playback.currentTime >= preview.seconds - CAP_EPSILON_SECONDS
  );
}
