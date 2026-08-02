import type { LessonPlayback } from '#/lib/admin-schemas';

export type VideoModalState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  /** The route 404'd: no video is assigned to this lesson. */
  | { kind: 'unavailable' }
  | { kind: 'rendering' }
  | { kind: 'failed' }
  | { kind: 'ready'; playback: Extract<LessonPlayback, { status: 'ready' }> };

export type VideoModalStateInput = {
  /**
   * Whether the query has produced a result. NOT `!isLoading`: a disabled
   * query reports `isLoading` forever, so a modal that has not opened yet
   * would otherwise be indistinguishable from one whose request is in flight.
   */
  isFetched: boolean;
  isError: boolean;
  errorMessage: string | null;
  /** `null` is a real 404 answer; `undefined` means nothing has arrived. */
  data: LessonPlayback | null | undefined;
};

/**
 * What the video preview modal should show.
 *
 * Extracted as a pure function because the container calls hooks and cannot be
 * rendered under this repo's Vitest setup (react-compiler nulls the
 * dispatcher), and because collapsing these five outcomes into one blank
 * placeholder is precisely the bug this exists to fix: an admin who clicks a
 * play tile and gets a grey box cannot tell "still rendering" from "this
 * course has no provider credentials" from "the request is in flight". Nor
 * could anyone debugging it from a screenshot.
 */
export function computeVideoModalState({
  isFetched,
  isError,
  errorMessage,
  data,
}: VideoModalStateInput): VideoModalState {
  // Checked first: an error clears `isFetched` in some paths and leaves stale
  // data in others, and either way the failure is the thing worth reporting.
  if (isError) {
    return {
      kind: 'error',
      message: errorMessage ?? 'Something went wrong resolving this video.',
    };
  }
  if (!isFetched) return { kind: 'loading' };
  if (!data) return { kind: 'unavailable' };
  if (data.status === 'ready') return { kind: 'ready', playback: data };
  return data.status === 'rendering'
    ? { kind: 'rendering' }
    : { kind: 'failed' };
}
