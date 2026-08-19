// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pendingPromotionAtom } from '#/atoms/promotion';
import { useSubmitLessonQuiz } from '#/data-hooks/use-lesson-quiz-result';

function wrapper(store: ReturnType<typeof createStore>) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

const savedRow = {
  id: 1,
  lessonSlug: 'l1',
  answers: [],
  createdAt: new Date().toISOString(),
};

describe('useSubmitLessonQuiz', () => {
  /**
   * The route returns `{ ...row, promotion }`. This is the seam most likely
   * to silently break: `lessonQuizResultSchema.parse` alone would strip
   * `promotion` (zod's default object mode drops unrecognised keys), so a
   * regression that reverts to parsing the raw response with only that
   * schema would pass every other test in this file while quietly losing
   * every promotion this route ever reports. Assert on the atom the
   * interstitial actually reads, not on the mutation's return value.
   */
  it('sets the pending-promotion atom when the response carries one', async () => {
    const store = createStore();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...savedRow,
          promotion: { id: 42, from: 'basic', to: 'intermediate' },
        }),
      }),
    );

    const { result } = renderHook(() => useSubmitLessonQuiz('l1'), {
      wrapper: wrapper(store),
    });
    result.current.mutate([]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(store.get(pendingPromotionAtom)).toEqual({
      id: 42,
      from: 'basic',
      to: 'intermediate',
    });
  });

  it('leaves the atom untouched when the response carries no promotion', async () => {
    const store = createStore();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...savedRow, promotion: null }),
      }),
    );

    const { result } = renderHook(() => useSubmitLessonQuiz('l1'), {
      wrapper: wrapper(store),
    });
    result.current.mutate([]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(store.get(pendingPromotionAtom)).toBeNull();
  });

  it('still writes the saved row into the result cache', async () => {
    const store = createStore();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...savedRow, promotion: null }),
      }),
    );

    const { result } = renderHook(() => useSubmitLessonQuiz('l1'), {
      wrapper: wrapper(store),
    });
    result.current.mutate([]);

    await waitFor(() =>
      expect(result.current.data).toEqual({ row: savedRow, promotion: null }),
    );
  });
});
