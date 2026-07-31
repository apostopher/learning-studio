/** Small, fixed budget for automatic mid-playback recovery attempts. */
export const MAX_RECOVERY_ATTEMPTS = 2;

export type RecoveryDecision =
  | { kind: 'retry'; attempt: number; message: string }
  | { kind: 'terminal'; message: string };

/**
 * Decides how `VideoPlayerContainer` should respond to a fatal HLS 401/403 —
 * a signed URL that was accepted at load time but rejected mid-playback (see
 * `attach-media.ts`'s `onError`).
 *
 * Pure and unit-testable on purpose: this repo's Vitest setup cannot render
 * any component that calls `useEffect` (confirmed repeatedly on this
 * branch), so the retry/backoff/terminal decision lives here instead of
 * inline in the container, following the same `compute-*-state.ts` pattern
 * used elsewhere (`compute-lesson-main-state.ts`,
 * `compute-video-preview-state.ts`) for exactly this reason.
 *
 * Bounded rather than infinite: re-resolving playback can only fix an
 * EXPIRED token, by minting a new one. A REVOKED signing key produces
 * another rejected token no matter how many times it is re-fetched, and nothing
 * client-side can tell those two cases apart — so this caps automatic
 * recovery at `MAX_RECOVERY_ATTEMPTS` and reports a truthful terminal state
 * once that budget is exhausted, rather than retrying (or worse, silently
 * saying "Reconnecting…") forever.
 */
export const computeRecoveryDecision = (
  attemptsSoFar: number,
): RecoveryDecision => {
  if (attemptsSoFar >= MAX_RECOVERY_ATTEMPTS) {
    return {
      kind: 'terminal',
      message: "This video couldn't be played right now. Try again.",
    };
  }
  return {
    kind: 'retry',
    attempt: attemptsSoFar + 1,
    message: 'Your playback session expired. Reconnecting…',
  };
};
