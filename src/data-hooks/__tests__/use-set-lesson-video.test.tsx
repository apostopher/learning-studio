// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '../keys';
import { useSetLessonVideo } from '../use-set-lesson-video';

const COURSE_ID = 7;

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
  it('invalidates the lessonPosters cache for the course, alongside courseBoard and lessonPlayback', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetLessonVideo(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 10,
        provider: 'mux',
        ref: 'playback-abc',
      });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      ([arg]) => arg?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(dataKeys.courseBoard(COURSE_ID));
    // The per-lesson PREFIX: playback is cached per course (Task 6b), and a
    // new video is a new video in every course teaching the lesson.
    expect(invalidatedKeys).toContainEqual(dataKeys.lessonPlaybacks(10));
    expect(invalidatedKeys).toContainEqual(dataKeys.lessonPosters(COURSE_ID));
  });

  /**
   * The library's "Edit lesson" dialog saves a video too, and a lesson's
   * `isConfigured` flips on every card that draws it: the library pane, the
   * org editor's rail and every course board. Asserted on the exact keys the
   * query client received — the mutant is invalidating only the one course
   * (or nothing) when there is no course in hand.
   */
  it('with no course in hand, invalidates the library, the editor board and every course board', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetLessonVideo(null), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 10,
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
    // Posters are cached per course; with none named, the prefix.
    expect(invalidatedKeys).toContainEqual(['admin', 'lesson-posters']);
  });

  it('with a course in hand, still refreshes the library and the editor rail', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetLessonVideo(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 10,
        provider: 'mux',
        ref: 'playback-abc',
      });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      ([arg]) => arg?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(dataKeys.orgLibrary());
    expect(invalidatedKeys).toContainEqual(dataKeys.editorBoard());
  });
});
