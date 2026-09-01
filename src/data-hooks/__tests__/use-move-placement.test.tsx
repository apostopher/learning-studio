// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useMovePlacement } from '#/data-hooks/use-move-placement';

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

describe('useMovePlacement', () => {
  it('PATCHes the lesson with its target module and both rank anchors', async () => {
    // Mutant this kills: the neighbour ids dropped from the body (the route
    // then averages against nothing and the lesson lands at the end of the
    // module rather than in the slot it was dropped into).
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { result } = renderHook(() => useMovePlacement(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 9,
        targetModuleId: 40,
        prevLessonId: 3,
        nextLessonId: 7,
      });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/lessons/9');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      targetModuleId: 40,
      prevLessonId: 3,
      nextLessonId: 7,
    });
  });

  // This is the ENTIRE reason this hook exists rather than `useMoveLesson`:
  // that one invalidates `courseBoard(courseId)`, a key the org-wide editor
  // never reads, so the board it just changed would never refetch.
  //
  // Mutant seen RED: `dataKeys.courseBoard(1)` in place of
  // `dataKeys.editorBoard()`. The mutation still succeeds, the optimistic
  // board still looks right, and the editor silently never reconciles with
  // the server.
  it('invalidates the editor board, not a single course board', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useMovePlacement(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 9,
        targetModuleId: 40,
        prevLessonId: null,
        nextLessonId: null,
      });
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(dataKeys.editorBoard());
    expect(keys).not.toContainEqual(dataKeys.courseBoard(1));
  });

  // Deliberately unlike `useLinkLesson`, which does NOT invalidate on failure.
  // A failed link created nothing, so its rollback is exact. A failed move
  // happens after the drag has already rewritten the cached board, so the
  // caller's rollback is a guess at what the server kept — the refetch is what
  // confirms it. `useMoveLesson`/`useReorderModule`, which these mirror, use
  // `onSettled` for the same reason.
  //
  // Mutant seen RED: `onSuccess` in place of `onSettled` — a failed move
  // leaves the board on the rollback guess with nothing to check it.
  it('still invalidates after a failure, so the rollback is confirmed', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', { status: 500 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useMovePlacement(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({
          lessonId: 9,
          targetModuleId: 40,
          prevLessonId: null,
          nextLessonId: null,
        })
        .catch(() => {});
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(dataKeys.editorBoard());
  });

  it('does not invalidate the library — a move changes no "in N courses" count', async () => {
    // Mutant this kills: `orgLibrary()` invalidated alongside the board,
    // refetching the whole library on every drag for a badge that cannot have
    // changed. Moving a placement between modules of one course leaves the
    // set of courses teaching that lesson exactly as it was.
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useMovePlacement(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 9,
        targetModuleId: 40,
        prevLessonId: null,
        nextLessonId: null,
      });
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).not.toContainEqual(dataKeys.orgLibrary());
  });
});
