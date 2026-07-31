// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCourseProgressSummary } from '#/data-hooks/use-course-progress-summary';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const summary = {
  slug: 'ppl',
  percent: 42,
  watchedLessons: 3,
  totalLessons: 8,
  modules: [{ moduleId: 1, percent: 42, watchedLessons: 3, totalLessons: 8 }],
  lessons: [
    { lessonId: 10, moduleId: 1, percent: 100, watched: true },
    { lessonId: 11, moduleId: 1, percent: 0, watched: false },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe('useCourseProgressSummary', () => {
  it('fetches the aggregated summary and returns the parsed payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => summary,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCourseProgressSummary('a b/c'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/course/progress-summary?slug=a%20b%2Fc',
    );
    expect(result.current.data).toEqual(summary);
  });

  it('is disabled (no fetch) when slug is empty', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCourseProgressSummary(''), {
      wrapper: wrapper(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
