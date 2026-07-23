// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReportVideoProgress } from '#/data-hooks/use-report-video-progress';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

const URL = '/api/user/report-video-progress';

describe('useReportVideoProgress', () => {
  it('reports via sendBeacon by default', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useReportVideoProgress(), {
      wrapper: wrapper(),
    });
    result.current.mutate({ videoId: 'v1', progress: 50 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(URL);
    const blob = beacon.mock.calls[0][1];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to a keepalive fetch when sendBeacon is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useReportVideoProgress(), {
      wrapper: wrapper(),
    });
    result.current.mutate({ videoId: 'v1', progress: 50 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({ videoId: 'v1', progress: 50 });
  });
});
