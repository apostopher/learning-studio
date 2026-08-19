// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pendingPromotionAtom } from '#/atoms/promotion';
import { usePromotionInterstitial } from '../use-promotion-interstitial';

function wrapper(
  store: ReturnType<typeof createStore>,
  queryClient: QueryClient,
) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('usePromotionInterstitial', () => {
  /**
   * The regression this guards: dismissing used to invalidate `myLevel`
   * immediately, without ever acknowledging the row — the refetch found the
   * same still-unacknowledged 'earned' row and the between-visits banner
   * announced the very promotion the pilot had just dismissed. Fixed by
   * acknowledging first and letting that mutation's own onSuccess drive the
   * `myLevel` invalidation.
   */
  it('acknowledges the promotion row on dismiss, and only invalidates myLevel after the server confirms', async () => {
    const store = createStore();
    store.set(pendingPromotionAtom, {
      id: 42,
      from: 'basic',
      to: 'intermediate',
    });

    let resolveAck: (() => void) | undefined;
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/user/level-acknowledge') {
        return new Promise((resolve) => {
          resolveAck = () =>
            resolve({ ok: true, status: 204 } as unknown as Response);
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => usePromotionInterstitial('course-1'), {
      wrapper: wrapper(store, queryClient),
    });

    act(() => {
      result.current.dismiss();
    });

    // Cleared the atom and invalidated courseDetails synchronously — neither
    // depends on the acknowledge POST settling.
    expect(store.get(pendingPromotionAtom)).toBeNull();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['course-details', 'course-1'],
    });

    // Fired the acknowledge POST with the promotion's own row id — not a
    // guessed or hardcoded one. useMutation dispatches asynchronously, so
    // this needs a flush.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/user/level-acknowledge',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ rowId: 42 }),
        }),
      ),
    );

    // myLevel must NOT be invalidated yet — the acknowledge POST is still in
    // flight. Invalidating it here would refetch a still-unacknowledged row
    // and re-announce the very promotion just dismissed.
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['user', 'my-level', 'course-1'] }),
    );

    // Resolve the acknowledge POST — only now should myLevel be invalidated,
    // via useAcknowledgeLevelChange's own onSuccess.
    resolveAck?.();
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['user', 'my-level', 'course-1'],
      }),
    );
  });

  it('does nothing (no acknowledge POST) when there is no pending promotion', () => {
    const store = createStore();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => usePromotionInterstitial('course-1'), {
      wrapper: wrapper(store, queryClient),
    });

    act(() => {
      result.current.dismiss();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
