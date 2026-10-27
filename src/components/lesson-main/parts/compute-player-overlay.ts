export type PlayerOverlayKind = 'coverage' | 'none';

/**
 * How close to `duration` still counts as "sitting at the end".
 *
 * `timeupdate` fires roughly every 250ms, so the last reported `currentTime`
 * before `ended` can trail `duration` slightly, and some containers report a
 * duration a shade longer than the last decodable frame. A whole second is far
 * more slack than that needs and far less than any deliberate seek.
 */
const END_EPSILON_SECONDS = 1;

export type ComputePlayerOverlayArgs = {
  /**
   * Whether this video has fired `ended` at least once this session. It is
   * NOT "the player is currently at the end" — see `playback` below.
   */
  reachedEnd: boolean;
  /**
   * Live player state, so an overlay never sits on top of a video the student
   * has gone back to. `CoverageNotice` is `absolute inset-0` over an 85%
   * opaque background and asks the student to "watch the parts you skipped":
   * covering the video while they do exactly that made the remedy impossible
   * to follow. Reading playback here — rather than clearing a flag from an
   * effect — means the suppression cannot get stuck in either direction.
   */
  playback: { paused: boolean; currentTime: number; duration: number };
  /** Already narrowed to the 'video' lock reason — see lesson-player-container.tsx. */
  materialLocked: boolean;
};

/**
 * Whether the player is resting at the end of the video, as opposed to
 * playing again or parked somewhere the student seeked back to.
 */
function isRestingAtEnd({
  paused,
  currentTime,
  duration,
}: ComputePlayerOverlayArgs['playback']): boolean {
  // Playing at all means the student moved on from the end state.
  if (!paused) return false;
  // Duration unknown (metadata not loaded, or a live/streamed source): trust
  // the `ended` event rather than suppressing a notice we cannot disprove.
  if (!(duration > 0)) return true;
  return currentTime >= duration - END_EPSILON_SECONDS;
}

/**
 * Which overlay (if any) sits on top of the video player. Extracted as a pure
 * function because `LessonPlayerContainer` cannot be rendered under Vitest —
 * react-compiler nulls the dispatcher for this repo's hook-calling
 * components, the same wall `lesson-main.test.tsx` documents for
 * `VideoPlayerContainer`. This is the only way the coverage notice's
 * rules (on at the end of an incomplete watch, off the moment the student
 * goes back to the video) can have a test that could ever go red.
 *
 * There used to be a second overlay: a Debrief button at the end of the
 * video. It went when the debrief moved to opening 24h after the lesson is
 * done (spaced review) — at the end of the video there is nothing to take
 * yet, and the Debrief tab says when there will be.
 */
export function computePlayerOverlay({
  reachedEnd,
  playback,
  materialLocked,
}: ComputePlayerOverlayArgs): PlayerOverlayKind {
  if (!reachedEnd) return 'none';
  if (!isRestingAtEnd(playback)) return 'none';
  return materialLocked ? 'coverage' : 'none';
}
