// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoCallAllowance } from '#/data-hooks/use-video-call';

const RESETS_AT = '2026-10-08T00:00:00.000Z';
const ALREADY_ACTIVE = {
  canStart: false,
  reason: 'already_active',
  remainingSeconds: 1200,
  resetsAt: RESETS_AT,
  activeCallId: 'vc-old',
};
const AVAILABLE = {
  canStart: true,
  reason: null,
  remainingSeconds: 1200,
  resetsAt: RESETS_AT,
  activeCallId: null,
};

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function respond(body: unknown) {
  return { ok: true, json: async () => body };
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useVideoCallAllowance', () => {
  it('re-checks every 10 s while a previous call is still closing, and stops once it has', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(ALREADY_ACTIVE))
      .mockResolvedValueOnce(respond(AVAILABLE))
      .mockResolvedValue(respond(AVAILABLE));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVideoCallAllowance(true), {
      wrapper: wrapper(),
    });
    await advance(0);
    expect(result.current.data?.reason).toBe('already_active');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(100); // let the refetch resolve
    expect(result.current.data?.canStart).toBe(true);

    // Available: no polling.
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never polls when available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(AVAILABLE));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useVideoCallAllowance(true), { wrapper: wrapper() });
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops polling when disabled (this tab's own call)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(ALREADY_ACTIVE));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderHook(
      ({ enabled }) => useVideoCallAllowance(enabled),
      { wrapper: wrapper(), initialProps: { enabled: true } },
    );
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
