export type PlayerOverlayKind = 'coverage' | 'debrief' | 'none';

export type ComputePlayerOverlayArgs = {
  videoEnded: boolean;
  /** Already narrowed to the 'video' lock reason — see lesson-player-container.tsx. */
  materialLocked: boolean;
  hasCurrentTest: boolean;
};

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
  videoEnded,
  materialLocked,
  hasCurrentTest,
}: ComputePlayerOverlayArgs): PlayerOverlayKind {
  if (!videoEnded) return 'none';
  if (materialLocked) return 'coverage';
  if (hasCurrentTest) return 'none';
  return 'debrief';
}
