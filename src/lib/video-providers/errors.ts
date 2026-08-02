/**
 * Why playback resolution failed, in terms the admin UI can act on.
 *
 * - `PROVIDER_AUTH_REJECTED` — the provider refused the *stored credential*.
 *   The admin has to enter a new key; nothing else will fix it.
 * - `VIDEO_NOT_AVAILABLE` — the credential works, but this video isn't playable
 *   (still rendering, or deleted at the provider). A new key would not help.
 * - `PROVIDER_UNAVAILABLE` — the provider errored or was unreachable. Transient;
 *   retrying is the right response.
 * - `PROVIDER_NOT_CONFIGURED` — this course has no stored credential for the
 *   provider its lesson uses. An admin has to add one; retrying never helps.
 *   Previously indistinguishable from "no video assigned" (both became a bare
 *   403), which is how 83 lessons could be dead with nothing saying why.
 * - `PROVIDER_RESPONSE_UNRECOGNISED` — the provider answered, but not in a
 *   shape we can read. NOT an outage: reporting it as one sends whoever is
 *   debugging it to check the network instead of the schema.
 *
 * The distinction is the whole point: before this existed, all three arrived as
 * an identical 500 and a revoked key looked exactly like a deleted video.
 */
export const PLAYBACK_FAILURE_CODES = [
  'PROVIDER_AUTH_REJECTED',
  'VIDEO_NOT_AVAILABLE',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_RESPONSE_UNRECOGNISED',
] as const;

export type PlaybackFailureCode = (typeof PLAYBACK_FAILURE_CODES)[number];

/**
 * Carries a `PlaybackFailureCode` across the wire boundary: thrown server-side
 * by `resolvePlayback`, and re-thrown client-side by `useLessonVideoPlayback`
 * after reading the code off the error response.
 */
export class PlaybackError extends Error {
  readonly code: PlaybackFailureCode;

  constructor(
    code: PlaybackFailureCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PlaybackError';
    this.code = code;
  }
}

/** True for the HTTP statuses that mean "your credential was refused". */
export const isAuthRejectionStatus = (status: number): boolean =>
  status === 401 || status === 403;

/**
 * Narrows an unknown error to a credential rejection. Used by the UI to decide
 * whether to surface the credential flow instead of the player.
 */
export const isProviderAuthRejection = (error: unknown): boolean =>
  error instanceof PlaybackError && error.code === 'PROVIDER_AUTH_REJECTED';
