/**
 * Whether a completed debrief attempt should be saved right now.
 *
 * Extracted for the same reason as should-auto-submit-quiz.ts: this fires
 * from a rendered state (every evaluation landed), not a button press, so
 * `readOnly` has to be checked here — hiding the score report would not stop
 * the effect from writing.
 */
export function shouldAutoSaveDebrief({
  isComplete,
  alreadySaved,
  readOnly,
}: {
  isComplete: boolean;
  alreadySaved: boolean;
  readOnly: boolean;
}): boolean {
  if (readOnly) return false;
  return isComplete && !alreadySaved;
}
