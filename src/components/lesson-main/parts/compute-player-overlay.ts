export type PlayerOverlayKind = 'coverage' | 'debrief' | 'none';

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
  hasCurrentTest: boolean;
  /**
   * `lessons.has_debrief`. Previously ignored entirely, so the overlay
   * appeared on every lesson regardless — a regression against the old
   * platform, which gated the button on this flag. It is authoritative now:
   * with it off, tab 2 is the authored quiz and there is no debrief to offer.
   */
  hasDebrief: boolean;
  /**
   * Whether the server can resolve a source to generate a debrief from: the
   * material's body text, or this video's caption transcript on a lesson with
   * no material row. Without one, generation 422s and the button would be a
   * press that produces nothing.
   */
  canDebrief: boolean;
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
 * `VideoPlayerContainer`. This is the only way the must-not-regress
 * requirement ("the debrief overlay must still appear on the normal path")
 * can have a test that could ever go red.
 *
 * The return type is a single string, not two independent booleans, so
 * "both overlays selected" is structurally impossible rather than merely
 * untested.
 */
export function computePlayerOverlay({
  reachedEnd,
  playback,
  materialLocked,
  hasCurrentTest,
  hasDebrief,
  canDebrief,
}: ComputePlayerOverlayArgs): PlayerOverlayKind {
  if (!reachedEnd) return 'none';
  if (!isRestingAtEnd(playback)) return 'none';
  if (materialLocked) return 'coverage';
  if (hasCurrentTest) return 'none';
  if (!hasDebrief || !canDebrief) return 'none';
  return 'debrief';
}
