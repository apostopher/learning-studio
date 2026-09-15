// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLessonVideo } from '#/data-hooks/use-lesson-video';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('useLessonVideo', () => {
  it('reads the lesson’s provider and ref from its video endpoint', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ provider: 'mux', ref: 'abc123' }), {
        status: 200,
      }),
    );
    const { result } = renderHook(() => useLessonVideo(10, true), { wrapper });
    await waitFor(() =>
      expect(result.current.data).toEqual({ provider: 'mux', ref: 'abc123' }),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/lessons/10/video');
  });

  it('does not ask when disabled — a lesson with no video has nothing to prefill', () => {
    renderHook(() => useLessonVideo(10, false), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
