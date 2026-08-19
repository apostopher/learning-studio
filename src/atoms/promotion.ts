import { atom } from 'jotai';
import { z } from 'zod';
import type { UserLevel } from '#/types';
import { UserLevelSchema } from '#/types';

/**
 * The promotion to show, set by whichever progress mutation's response carried
 * one. Null when there is nothing to announce.
 *
 * Carries `id` — the `user_levels` row's own id — so dismissing the
 * interstitial can acknowledge that exact row (see
 * usePromotionInterstitial in course.$courseSlug.tsx). Without it, the same
 * earned promotion the pilot just dismissed in-flow would still be
 * unacknowledged in the DB and reappear as the between-visits banner the
 * next time useMyLevel refetched — which is exactly what invalidating
 * `myLevel` on dismiss used to trigger.
 */
export const pendingPromotionAtom = atom<{
  id: number;
  from: UserLevel;
  to: UserLevel;
} | null>(null);

/**
 * Mirrors `Promotion` from `#/lib/promotion.server` (the server never imports
 * the client, so the shape is duplicated here rather than shared) — the four
 * progress-write endpoints all return `{ ..., promotion }` alongside their own
 * payload, and every data hook that calls one of them uses this to pull the
 * promotion out without depending on the rest of the response shape.
 */
const promotionShapeSchema = z.object({
  id: z.number(),
  from: UserLevelSchema,
  to: UserLevelSchema,
});

/**
 * Best-effort extraction: a missing or malformed `promotion` field (an older
 * cached response, a route that doesn't carry one, a test stub json of `{}`)
 * resolves to `null` rather than throwing. Failing to announce a promotion is
 * a missed celebration; throwing out of a mutation's success path over it
 * would turn a cosmetic miss into a broken save.
 */
export function extractPromotion(
  json: unknown,
): { id: number; from: UserLevel; to: UserLevel } | null {
  if (typeof json !== 'object' || json === null || !('promotion' in json)) {
    return null;
  }
  const parsed = promotionShapeSchema.safeParse(
    (json as Record<string, unknown>).promotion,
  );
  return parsed.success ? parsed.data : null;
}
