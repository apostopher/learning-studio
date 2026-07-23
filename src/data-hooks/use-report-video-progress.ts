import { useMutation } from '@tanstack/react-query';
import { saveJson } from './save-json';

export interface ReportVideoProgressInput {
  videoId: string;
  progress: number;
}

/**
 * Report a video-progress milestone for the logged-in user. Best-effort by
 * design: sends via `navigator.sendBeacon` so it survives page unload /
 * navigation (the common case when a video ends or the user leaves), falling
 * back to a `keepalive` fetch when the beacon is unavailable or rejected.
 * No cache invalidation — progress is fired frequently during playback and the
 * server row is append-only; readers refresh on their own next fetch.
 */
export function useReportVideoProgress() {
  return useMutation({
    mutationFn: (input: ReportVideoProgressInput) =>
      saveJson({
        url: '/api/user/report-video-progress',
        method: 'POST',
        body: input,
        fireAndForget: true,
      }),
  });
}
