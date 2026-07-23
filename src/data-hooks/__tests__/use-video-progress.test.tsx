// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVideoProgress } from '#/data-hooks/use-video-progress';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useVideoProgress', () => {
  it('fetches the single-video progress and returns the parsed payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ milestonesHit: [10, 15, 20], watched: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVideoProgress('vid a/b'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user/video-progress?videoId=vid%20a%2Fb',
    );
    expect(result.current.data).toEqual({
      milestonesHit: [10, 15, 20],
      watched: false,
    });
  });

  it('is disabled (no fetch) when videoId is empty', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVideoProgress(''), {
      wrapper: wrapper(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
