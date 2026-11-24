// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '../keys';
import { useSetLessonVideo } from '../use-set-lesson-video';

function makeHarness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => vi.restoreAllMocks());

describe('useSetLessonVideo', () => {
  // Regression guard: assigning a video used to invalidate courseBoard and
  // lessonPlayback but NOT lessonPosters, so a freshly-attached video's tile
  // flipped from "No video" to a play tile and then stayed grey for the full
  // 30-minute lessonPosters staleTime — the board's own query client never
  // received the instruction to refetch it. Asserted on the query client's
  // actual invalidateQueries calls (the real consumer of this mutation's
  // onSuccess), not on any internal state, so a wiring regression here fails
  // this test instead of sailing through it.
  it('invalidates the posters, alongside courseBoard and lessonPlayback', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetLessonVideo(10), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        provider: 'mux',
        ref: 'playback-abc',
      });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      ([arg]) => arg?.queryKey,
    );
    // Every board, not this course's: they all draw Disciplines' version.
    expect(invalidatedKeys).toContainEqual(dataKeys.courseBoards());
    // The per-lesson PREFIX: the working copy is previewed through any course.
    expect(invalidatedKeys).toContainEqual(dataKeys.lessonPlaybacks(10));
    // Every shelf's: it is the library that draws the working copy.
    expect(invalidatedKeys).toContainEqual(dataKeys.allLessonPosters());
  });

  /**
   * The library's "Edit lesson" dialog saves a video, and a lesson's
   * `isConfigured` flips on the library card; the boards draw the version that
   * may come with it. Asserted on the exact keys the query client received.
   */
  it('invalidates the library, the editor board and every course board', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetLessonVideo(10), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        provider: 'mux',
        ref: 'playback-abc',
      });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      ([arg]) => arg?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(dataKeys.orgLibrary());
    expect(invalidatedKeys).toContainEqual(dataKeys.editorBoard());
    expect(invalidatedKeys).toContainEqual(dataKeys.courseBoards());
    expect(invalidatedKeys).toContainEqual(dataKeys.lessonPlaybacks(10));
  });

  // A replaced video is a different video with different captions (or none,
  // or a provider with no Mux captions at all). Without this the admin
  // captions line kept the old video's "captions ready" or cached `not_mux`.
  it('invalidates every captions status of the lesson', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetLessonVideo(10), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        provider: 'mux',
        ref: 'playback-abc',
      });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      ([arg]) => arg?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(dataKeys.lessonCaptionsAll(10));
  });
});
