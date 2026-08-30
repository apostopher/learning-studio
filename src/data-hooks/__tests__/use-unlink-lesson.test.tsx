// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useUnlinkLesson } from '#/data-hooks/use-unlink-lesson';

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

describe('useUnlinkLesson', () => {
  it('DELETEs the placement route', async () => {
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { result } = renderHook(() => useUnlinkLesson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 40, lessonId: 9 });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/modules/40/lessons/9');
    expect(init?.method).toBe('DELETE');
  });

  // Mutant this kills: an onSuccess that invalidates only one of the two
  // keys — same reasoning as useLinkLesson: unlinking changes both the
  // course's board and the library's "in N courses" badge.
  it('invalidates BOTH the editor board and the library on success', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUnlinkLesson(), { wrapper });

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
      new Response('nope', { status: 404 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUnlinkLesson(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ moduleId: 40, lessonId: 9 })
        .catch(() => {});
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
