// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useReorderEditorModule } from '#/data-hooks/use-reorder-editor-module';

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

describe('useReorderEditorModule', () => {
  it('PATCHes the module with both rank anchors', async () => {
    // Mutant this kills: the module id read from the body instead of the URL
    // (or the anchors omitted) — the route would reorder nothing, or the
    // wrong thing.
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { result } = renderHook(() => useReorderEditorModule(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        moduleId: 40,
        prevModuleId: 12,
        nextModuleId: null,
      });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/modules/40');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      prevModuleId: 12,
      nextModuleId: null,
    });
  });

  // The whole justification for this hook over `useReorderModule`: that one
  // invalidates `courseBoard(courseId)` and takes the course id at hook-call
  // time, which a pane rendering every course in the org cannot supply.
  //
  // Mutant seen RED: `dataKeys.courseBoard(1)` in place of
  // `dataKeys.editorBoard()` — the reorder persists and the rail never
  // refetches.
  it('invalidates the editor board, not a single course board', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useReorderEditorModule(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        moduleId: 40,
        prevModuleId: null,
        nextModuleId: 12,
      });
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(dataKeys.editorBoard());
    expect(keys).not.toContainEqual(dataKeys.courseBoard(1));
  });

  // Same deliberate difference from `useLinkLesson` as `useMovePlacement` —
  // see that hook's test for the reasoning.
  // Mutant seen RED: `onSuccess` in place of `onSettled`.
  it('still invalidates after a failure, so the rollback is confirmed', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', { status: 500 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useReorderEditorModule(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ moduleId: 40, prevModuleId: null, nextModuleId: 12 })
        .catch(() => {});
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(dataKeys.editorBoard());
  });

  it('does not invalidate the library — reordering modules changes no lesson placement', async () => {
    // Mutant this kills: `orgLibrary()` invalidated too. Module order has no
    // bearing on which courses teach which lesson, so refetching the library
    // here is pure cost.
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useReorderEditorModule(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        moduleId: 40,
        prevModuleId: null,
        nextModuleId: 12,
      });
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).not.toContainEqual(dataKeys.orgLibrary());
  });
});
