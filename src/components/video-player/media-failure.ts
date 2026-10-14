import { computeRecoveryDecision } from './compute-recovery-action';

/**
 * What the container does on a fatal media error (an expired or refused
 * signed URL): always show the error overlay; while the recovery budget
 * lasts, ask the caller for a fresh source; once it is spent, tell the
 * caller playback has failed for good (admin uses this to flag a dead key).
 */
export function fatalMediaOutcome(attemptsSoFar: number) {
  const decision = computeRecoveryDecision(attemptsSoFar);
  return {
    patch: { status: 'error' as const, error: decision.message },
    retry: decision.kind === 'retry' ? { attempt: decision.attempt } : null,
    failedMessage: decision.kind === 'terminal' ? decision.message : null,
  };
}

/** A caption file that failed to load (e.g. its signed URL expired) is
 * disclosed as unavailable rather than left as a CC toggle for a blank track. */
export function captionLoadFailedPatch() {
  return {
    hasCaptions: false as const,
    captionsEnabled: false as const,
    captionsUnavailable: true as const,
  };
}

/** Stable identity of a caption set by content, not array identity: callers
 * rebuild the array every render, and only a changed `src` (a fresh signed
 * URL) should clear a caption load error. */
export function captionsSignature(
  captions: ReadonlyArray<{ src: string }> | undefined,
): string {
  return captions?.map((c) => c.src).join('|') ?? '';
}

/** Whether the CC toggle may show: a `<track>` whose file failed to load stays
 * in the DOM, so the raw track count must not override "unavailable". */
export function resolveHasCaptions(
  trackCount: number,
  captionsUnavailable: boolean,
): boolean {
  return trackCount > 0 && !captionsUnavailable;
}
