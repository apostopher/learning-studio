// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useLessonVideoPlayback } from '#/data-hooks/use-lesson-video-playback';

/**
 * Task 6b: the admin playback route no longer infers a course from the
 * lesson — the client names the course it is editing, and the route guards
 * and signs with THAT course's credentials. So the request must carry it,
 * and the cache must be keyed by it: a lesson taught by two courses is two
 * different signed URLs, and one entry shared between them would hand
 * course B's preview course A's credentials until the entry went stale.
 *
 * `playbackRefetchDelayMs` (the pure part) is covered in
 * use-lesson-video-playback.test.ts; this file renders the hook itself and
 * asserts on what `fetch` and the query cache — the consumers — received.
 */
function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => vi.unstubAllGlobals());

describe('useLessonVideoPlayback', () => {
  it('asks the route for the lesson IN the course it was given, and caches under that course', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'rendering' }),
      }),
    );
    const { client, wrapper } = harness();

    const { result } = renderHook(
      () => useLessonVideoPlayback({ lessonId: 10, courseId: 7 }, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/admin/lessons/10/video-playback?courseId=7',
    );
    // The entry the NEXT reader of this lesson-in-this-course finds — and,
    // by the same key, the entry a reader of the same lesson in course 8
    // does NOT find.
    expect(client.getQueryData(dataKeys.lessonPlayback(10, 7))).toEqual({
      status: 'rendering',
    });
    expect(client.getQueryData(dataKeys.lessonPlayback(10, 8))).toBeUndefined();
  });

  it('fetches nothing while it has no lesson to ask about', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { wrapper } = harness();

    // The board's preview modal is mounted closed, with no lesson selected;
    // `enabled` alone used to carry this, now the target does too.
    const { result } = renderHook(() => useLessonVideoPlayback(null, true), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still maps the route’s 404 to null rather than an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const { wrapper } = harness();

    const { result } = renderHook(
      () => useLessonVideoPlayback({ lessonId: 10, courseId: 7 }, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
