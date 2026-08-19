import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { pendingPromotionAtom } from '#/atoms/promotion';
import { useAcknowledgeLevelChange } from '#/data-hooks/use-my-level';
import { queryKeys } from '#/hooks/data/keys';

/**
 * Reads the pending promotion set by any of the four progress mutations
 * (section tap, video milestone, quiz submit, debrief save) and returns the
 * dismiss handler for the interstitial that announces it.
 *
 * Extracted into its own module (out of `course.$courseSlug.tsx`) so this can
 * be exercised with `renderHook` — it calls no raw `useRef`/`useEffect`, only
 * `useAtomValue`/`useSetAtom`/`useQueryClient`/`useCallback` and a
 * `useMutation`-backed hook, none of which hit this repo's Vitest wall (see
 * `compute-material-panel-state.ts`'s comment for the hooks that do).
 *
 * Meant to be mounted once per course visit, on the layout, rather than
 * per-lesson: the layout stays mounted across every lesson within a course
 * visit, so a promotion earned on one lesson is still announced even if the
 * mutation that earned it belongs to a component that has since unmounted
 * (e.g. the tab that fired the winning section tap).
 *
 * On dismiss: ACKNOWLEDGE the row the promotion came from, then invalidate
 * `courseDetails` (the cached course tree, so the pilot's newly visible
 * lessons show up). `myLevel` is deliberately NOT invalidated here directly —
 * `useAcknowledgeLevelChange` already invalidates it, but only in its own
 * `onSuccess`, after the server has actually recorded the acknowledgement.
 *
 * This matters: every earned promotion is also an unacknowledged
 * `getUnacknowledgedLevelChange` row (source: 'earned'), which is what makes
 * `CourseLevelBanner` announce a promotion the pilot missed via the
 * `sendBeacon` video-progress path (no readable response). Before this fix,
 * dismissing THIS dialog invalidated `myLevel` immediately, without ever
 * acknowledging the row — the refetch found the same still-unacknowledged
 * row and the between-visits banner announced the very promotion the pilot
 * had just dismissed. Acknowledging first, and letting the mutation's own
 * success handler drive the `myLevel` refetch, makes "announced in-flow" and
 * "needs announcing on next load" mutually exclusive.
 */
export function usePromotionInterstitial(courseSlug: string) {
  const promotion = useAtomValue(pendingPromotionAtom);
  const setPromotion = useSetAtom(pendingPromotionAtom);
  const queryClient = useQueryClient();
  const acknowledge = useAcknowledgeLevelChange(courseSlug);

  const dismiss = useCallback(() => {
    if (promotion) acknowledge.mutate(promotion.id);
    setPromotion(null);
    queryClient.invalidateQueries({
      queryKey: queryKeys.courseDetails(courseSlug),
    });
  }, [courseSlug, promotion, acknowledge, queryClient, setPromotion]);

  return { promotion, dismiss };
}
