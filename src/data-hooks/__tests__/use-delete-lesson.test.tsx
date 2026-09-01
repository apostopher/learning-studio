// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useDeleteLesson } from '#/data-hooks/use-delete-lesson';

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

describe('useDeleteLesson', () => {
  /**
   * A lesson is org-owned and can sit in several courses, so BOTH surfaces'
   * caches go stale at once: the org editor's single board, the library, and
   * every per-course board that was teaching it.
   *
   * Asserted against a real `QueryClient` with all three entries seeded, and
   * read back through `getQueryState().isInvalidated` — i.e. on what the
   * consumer's cache actually did, not on the arguments the hook passed. A
   * mocked `invalidateQueries` would have to be told whether a prefix counts,
   * which is the very thing under test.
   *
   * Mutant this kills: the `courseBoards()` line dropped (round 0's shape,
   * correct while the per-course board was redirected away and wrong the
   * moment it came back) — the deleted lesson then sits on that board, still
   * clickable, for up to its 30s `staleTime`.
   */
  it('invalidates the library, the org editor AND every per-course board', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    client.setQueryData(dataKeys.editorBoard(), []);
    client.setQueryData(dataKeys.orgLibrary(), {
      disciplines: [],
      untitled: [],
    });
    client.setQueryData(dataKeys.courseBoard(7), { course: {}, modules: [] });
    client.setQueryData(dataKeys.courseBoard(9), { course: {}, modules: [] });
    const { result } = renderHook(() => useDeleteLesson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(9);
    });

    const invalidated = (key: readonly unknown[]) =>
      client.getQueryState(key)?.isInvalidated ?? false;
    expect(invalidated(dataKeys.editorBoard())).toBe(true);
    expect(invalidated(dataKeys.orgLibrary())).toBe(true);
    // Both of them: the lesson left every course, not just the one whose
    // board happened to be on screen.
    expect(invalidated(dataKeys.courseBoard(7))).toBe(true);
    expect(invalidated(dataKeys.courseBoard(9))).toBe(true);
  });

  /**
   * Mutant this kills: `dataKeys.courseBoards()` widened to `['admin']`,
   * which would invalidate every admin query in the app — the users list, the
   * role grid, personas — on a lesson delete.
   */
  it('does not invalidate unrelated admin queries', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    client.setQueryData(dataKeys.adminUsers(), []);
    client.setQueryData(dataKeys.adminCourses(), []);
    const { result } = renderHook(() => useDeleteLesson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(9);
    });

    expect(client.getQueryState(dataKeys.adminUsers())?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(dataKeys.adminCourses())?.isInvalidated).toBe(
      false,
    );
  });

  /**
   * Authority over a lesson's existence follows its DISCIPLINE, so a 403 here
   * is a standing refusal — retrying will never work, and the dialog must not
   * say "please try again".
   *
   * Mutant this kills: the 403 branch removed, so the message becomes
   * "Failed to delete lesson (403)" and the dialog falls back to its generic
   * retry copy.
   */
  it('turns a 403 into a sentence about authority, not a retry', async () => {
    const { wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );
    const { result } = renderHook(() => useDeleteLesson(), { wrapper });

    let message = '';
    await act(async () => {
      await result.current.mutateAsync(9).catch((error: Error) => {
        message = error.message;
      });
    });

    expect(message).toMatch(/discipline/i);
    expect(message).not.toMatch(/try again/i);
    expect(message).not.toMatch(/403/);
  });
});
