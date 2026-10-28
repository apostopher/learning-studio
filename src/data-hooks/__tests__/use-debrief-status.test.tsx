// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDebriefStatus } from '#/data-hooks/use-debrief-status';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

const args = { courseSlug: 'ppl', lessonSlug: 'l1', enabled: true };

describe('useDebriefStatus', () => {
  it('requests the lesson in its course and returns the parsed status', async () => {
    const body = {
      state: { kind: 'not-done' },
      lessonOutstanding: [{ kind: 'video' }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDebriefStatus(args), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/lesson/debrief-status?lessonSlug=l1&courseSlug=ppl',
    );
    expect(result.current.data).toEqual(body);
  });

  it('errors on a payload that is not a debrief status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ state: { kind: 'bogus' }, lessonOutstanding: [] }),
      }),
    );
    const { result } = renderHook(() => useDebriefStatus(args), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('errors on a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );
    const { result } = renderHook(() => useDebriefStatus(args), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not fetch while disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useDebriefStatus({ ...args, enabled: false }), {
      wrapper: wrapper(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
