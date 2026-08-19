import { useMutation } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { extractPromotion, pendingPromotionAtom } from '#/atoms/promotion';
import { saveJson } from './save-json';

export interface ReportVideoProgressInput {
  lessonSlug: string;
  progress: number;
}

/**
 * Report a video-progress milestone for the logged-in user. Best-effort by
 * design: sends via `navigator.sendBeacon` so it survives page unload /
 * navigation (the common case when a video ends or the user leaves), falling
 * back to a `keepalive` fetch when the beacon is unavailable or rejected.
 * No cache invalidation — progress is fired frequently during playback and the
 * server row is append-only; readers refresh on their own next fetch.
 *
 * `/api/user/report-video-progress` returns a `promotion` alongside the save,
 * so `parse` pulls it out here and the atom gets set on success. Note this
 * only ever fires on the keepalive-fallback path: a successful `sendBeacon`
 * — the common case, not just the unload case — has no response to read, so
 * a promotion earned on a milestone this route reports via beacon is
 * structurally invisible to the client. That is a pre-existing property of
 * `fireAndForget`, not something introduced here; see the task-13 report.
 */
export function useReportVideoProgress() {
  const setPromotion = useSetAtom(pendingPromotionAtom);

  return useMutation({
    mutationFn: (input: ReportVideoProgressInput) =>
      saveJson({
        url: '/api/user/report-video-progress',
        method: 'POST',
        body: input,
        fireAndForget: true,
        parse: extractPromotion,
      }),
    onSuccess: (promotion) => {
      if (promotion) setPromotion(promotion);
    },
  });
}
