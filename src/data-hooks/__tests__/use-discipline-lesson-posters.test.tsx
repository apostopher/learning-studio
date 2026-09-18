// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useDisciplineLessonPosters } from '#/data-hooks/use-discipline-lesson-posters';

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

describe('useDisciplineLessonPosters', () => {
  it("GETs the discipline's posters and parses them by lesson id", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ '12': 'https://p/12.jpg' }),
      }),
    );
    const { result } = renderHook(() => useDisciplineLessonPosters(4), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.data).toEqual({ '12': 'https://p/12.jpg' }),
    );
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      '/api/admin/disciplines/4/lesson-posters',
    );
  });

  it('lives under the all-posters prefix, so a video change on any lesson refreshes the shelf too', () => {
    const key = dataKeys.disciplineLessonPosters(4);
    const prefix = dataKeys.allLessonPosters();
    expect(key.slice(0, prefix.length)).toEqual([...prefix]);
    // Distinct from a course's key with the same number.
    expect(key).not.toEqual(dataKeys.lessonPosters(4));
  });

  it('does not retry a refusal — a 403 is a permanent answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useDisciplineLessonPosters(4), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
