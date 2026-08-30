// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useLinkLesson } from '#/data-hooks/use-link-lesson';

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

describe('useLinkLesson', () => {
  it('POSTs lessonId to the module lessons route', async () => {
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 1 }), { status: 200 }),
      );
    const { result } = renderHook(() => useLinkLesson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 40, lessonId: 9 });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/modules/40/lessons');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ lessonId: 9 });
  });

  // Mutant this kills: an onSuccess that invalidates only the editor board
  // (or only the library) — the badge count on the untouched key would go
  // stale with nothing telling the admin it's wrong.
  it('invalidates BOTH the editor board and the library on success', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useLinkLesson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 40, lessonId: 9 });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => call[0]?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(dataKeys.editorBoard());
    expect(invalidatedKeys).toContainEqual(dataKeys.orgLibrary());
  });

  it('does not invalidate on failure', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('conflict', { status: 409 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useLinkLesson(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ moduleId: 40, lessonId: 9 })
        .catch(() => {});
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
