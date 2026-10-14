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

/**
 * A settled recovery that must re-attach `forSrc` even if the refetch handed
 * back the very same url — Mux signs deterministically (no `iat`, `exp` =
 * whole seconds), so a re-sign within the same second IS the same url, and
 * an attach effect keyed on `src` alone would never run again: no new fatal
 * error, no spent budget, no `onPlaybackFailed`, "Reconnecting…" forever.
 * `n` only ever grows, so each settled recovery is a new value. `null`: no
 * recovery has settled yet.
 */
export type ReattachRequest = { forSrc: string; n: number } | null;

/** Called once the caller's `onSourceExpired` (refetch) has settled. */
export function requestReattach(
  prev: ReattachRequest,
  failedSrc: string,
): ReattachRequest {
  return { forSrc: failedSrc, n: (prev?.n ?? 0) + 1 };
}

/**
 * The attach effect's extra dependency. It changes only while the request
 * is for the src currently showing: when the refetch brought a FRESH url,
 * that src change already re-attached, and the key stays `null` so the
 * settled request adds no second attach.
 */
export function reattachKey(
  req: ReattachRequest,
  src: string | undefined,
): number | null {
  return req !== null && req.forSrc === src ? req.n : null;
}

/**
 * The recovery budget once the media reports `playing`. A recovery that got
 * a re-attached source actually playing has worked, so the budget re-arms;
 * a `playing` with no re-attach since the failure proves nothing.
 */
export function recoveryAttemptsOnPlaying(
  attempts: number,
  reattachedSinceFailure: boolean,
): number {
  return reattachedSinceFailure ? 0 : attempts;
}
