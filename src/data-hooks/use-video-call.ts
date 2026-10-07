import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allowanceResponseSchema,
  type StartRequest,
  startErrorResponseSchema,
  startResponseSchema,
  statusResponseSchema,
  type VideoCallStartErrorReason,
  type VideoCallStatusResponse,
} from '#/lib/video-call-contract';
import { dataKeys } from './keys';

export class VideoCallStartError extends Error {
  constructor(
    readonly reason: VideoCallStartErrorReason,
    readonly resetsAt: string | null,
  ) {
    super(`Video call could not start: ${reason}`);
    this.name = 'VideoCallStartError';
  }
}

/** How often to re-check while a previous call is still closing. */
const CLOSING_CALL_RECHECK_MS = 10_000;

/** Whether the video button is available. The server re-checks on start, so
 * a stale answer can only ever show a button that then explains its 403.
 *
 * No refocus refetch, and no polling except in one case: `already_active`.
 * After a reload mid-call the old call stays active until Tavus notices the
 * learner left (~30 s); without a re-check the button would stay locked
 * until some unrelated refetch. Callers pass `enabled: false` during this
 * tab's own call, which also stops this interval — the allowance route calls
 * Tavus while a call is active, so it must never poll then. */
export function useVideoCallAllowance(enabled: boolean) {
  return useQuery({
    queryKey: dataKeys.videoCallAllowance(),
    queryFn: async () => {
      const res = await fetch('/api/video-call/allowance');
      if (!res.ok)
        throw new Error(`Failed to load video call allowance (${res.status})`);
      return allowanceResponseSchema.parse(await res.json());
    },
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.data?.reason === 'already_active'
        ? CLOSING_CALL_RECHECK_MS
        : false,
  });
}

export function useStartVideoCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartRequest) => {
      const res = await fetch('/api/video-call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = startErrorResponseSchema.safeParse(json);
        throw new VideoCallStartError(
          err.success ? err.data.reason : 'provider_unavailable',
          err.success ? (err.data.resetsAt ?? null) : null,
        );
      }
      return startResponseSchema.parse(json);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: dataKeys.videoCallAllowance(),
      }),
  });
}

export function useEndVideoCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/video-call/${encodeURIComponent(id)}/end`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Failed to end video call (${res.status})`);
      return statusResponseSchema.parse(await res.json());
    },
    onSuccess: (status, id) =>
      queryClient.setQueryData(dataKeys.videoCall(id), status),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: dataKeys.videoCallAllowance(),
      }),
  });
}

export async function fetchVideoCallStatus(
  id: string,
): Promise<VideoCallStatusResponse> {
  const res = await fetch(`/api/video-call/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to load video call (${res.status})`);
  return statusResponseSchema.parse(await res.json());
}
