import type { UserLevel } from '#/types';
import { UserLevelSchema } from '#/types';

/**
 * The specific 403 `/api/lesson/material` sends for a lesson outside the
 * pilot's current level that they never completed — `{ error: 'out-of-tier',
 * level }` (see routes/api/lesson/material.ts). A distinct error class, not a
 * generic `Error`, so `lessonMaterialAtomFamily`'s consumer can tell "this
 * lesson does not belong to you" apart from a network hiccup and redirect
 * instead of rendering a retryable error card.
 */
export class OutOfTierMaterialError extends Error {
  readonly level: UserLevel;

  constructor(level: UserLevel) {
    super('out-of-tier');
    this.name = 'OutOfTierMaterialError';
    this.level = level;
  }
}

/**
 * Parses a 403 response body into an `OutOfTierMaterialError`, or null if the
 * body is not that specific shape (any other 403/500/network failure keeps
 * falling through to the generic error path).
 */
export async function readOutOfTierError(
  response: Response,
): Promise<OutOfTierMaterialError | null> {
  if (response.status !== 403) return null;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    (body as Record<string, unknown>).error !== 'out-of-tier'
  ) {
    return null;
  }
  const level = UserLevelSchema.safeParse(
    (body as Record<string, unknown>).level,
  );
  // No usable level, no OutOfTierMaterialError. Defaulting to 'basic' here
  // would let `OutOfTierNotice` tell an Advanced pilot "your current level
  // (Basic)" — a confidently wrong statement about their own account, from a
  // body we have just established we cannot read. Falling through to the
  // generic error path says less, and everything it says is true.
  if (!level.success) return null;
  return new OutOfTierMaterialError(level.data);
}
