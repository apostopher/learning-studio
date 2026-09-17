// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useLessonAlternateVideos } from '#/data-hooks/use-lesson-alternate-videos';
import { useRemoveLessonAlternateVideo } from '#/data-hooks/use-remove-lesson-alternate-video';
import { useSetLessonAlternateVideo } from '#/data-hooks/use-set-lesson-alternate-video';

const entry = {
  lang: 'fr-CA' as const,
  provider: 'synthesia' as const,
  ref: 'x',
};
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => [entry] }),
  );
});

describe('useLessonAlternateVideos', () => {
  it("GETs the lesson's alternates and parses them", async () => {
    const { result } = renderHook(() => useLessonAlternateVideos(10, true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual([entry]));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      '/api/admin/lessons/10/alternate-videos',
    );
  });
});

describe('useSetLessonAlternateVideo', () => {
  it('PUTs the entry and invalidates the alternates list and every playback for the lesson', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSetLessonAlternateVideo(), {
      wrapper,
    });
    await act(() => result.current.mutateAsync({ lessonId: 10, ...entry }));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/lessons/10/alternate-videos');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual(entry);
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: dataKeys.lessonAlternateVideos(10) }),
    );
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: dataKeys.lessonPlaybacks(10) }),
    );
  });
});

describe('useRemoveLessonAlternateVideo', () => {
  it('DELETEs by lang and invalidates the same keys', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRemoveLessonAlternateVideo(), {
      wrapper,
    });
    await act(() =>
      result.current.mutateAsync({ lessonId: 10, lang: 'fr-CA' }),
    );
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'fr-CA' });
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: dataKeys.lessonAlternateVideos(10) }),
    );
  });
});
