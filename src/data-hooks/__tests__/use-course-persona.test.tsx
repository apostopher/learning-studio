// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useSetCoursePersona } from '#/data-hooks/use-course-persona';

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const KEY = dataKeys.coursePersona(2);

afterEach(() => vi.restoreAllMocks());

/**
 * The radio's checked state reads straight off this query, so these assert the
 * cache — the thing the control actually renders from — rather than the
 * mutation's own status. Without the optimistic write the dot only moves after
 * a PUT *and* a refetch have both landed, which reads as a broken control.
 */
describe('useSetCoursePersona — optimistic selection', () => {
  it('updates the cache before the request resolves', async () => {
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        await inFlight;
        return { ok: true, status: 204, json: async () => ({}) };
      }),
    );

    const { client, wrapper } = setup();
    client.setQueryData(KEY, { linked: true, personaId: null });

    const { result } = renderHook(() => useSetCoursePersona(2), { wrapper });
    result.current.mutate(7);

    // The request is deliberately still hanging here.
    await waitFor(() =>
      expect(client.getQueryData(KEY)).toEqual({ linked: true, personaId: 7 }),
    );

    release?.();
  });

  it('clearing to the org default is optimistic too', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 204, json: async () => ({}) }),
    );

    const { client, wrapper } = setup();
    client.setQueryData(KEY, { linked: true, personaId: 7 });

    const { result } = renderHook(() => useSetCoursePersona(2), { wrapper });
    result.current.mutate(null);

    await waitFor(() =>
      expect(client.getQueryData(KEY)).toEqual({
        linked: true,
        personaId: null,
      }),
    );
  });

  it('rolls back when the server rejects the selection', async () => {
    // e.g. picking a persona that has never been published — the radio must
    // not keep claiming a selection the server refused.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Publish this persona first' }),
      }),
    );

    const { client, wrapper } = setup();
    client.setQueryData(KEY, { linked: true, personaId: 3 });

    const { result } = renderHook(() => useSetCoursePersona(2), { wrapper });
    result.current.mutate(7);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(KEY)).toEqual({ linked: true, personaId: 3 });
  });
});
