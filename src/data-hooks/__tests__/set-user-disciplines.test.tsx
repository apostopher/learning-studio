// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSetUserDisciplines } from '#/data-hooks/use-disciplines';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 204,
    json: async () => ({}),
  });
  vi.stubGlobal('fetch', fetchMock);
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Every (method, url) pair `fetch` was asked for, in call order. */
const calls = () =>
  fetchMock.mock.calls.map((call) => [
    (call[1] as RequestInit).method,
    String(call[0]),
  ]);

describe('useSetUserDisciplines', () => {
  it('grants only what is new and revokes only what is gone', async () => {
    const { result } = renderHook(() => useSetUserDisciplines(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'u1',
        disciplineIds: [2, 3],
        current: [1, 2],
      });
    });

    // The whole point of the hook. A mutant that PUT every wanted id would
    // still leave the roster correct — the endpoint is idempotent — but would
    // issue a write per discipline on every save, and would never revoke
    // anything, so discipline 1 would silently stay.
    expect(calls()).toEqual([
      ['PUT', '/api/admin/disciplines/3/staff'],
      ['DELETE', '/api/admin/disciplines/1/staff'],
    ]);
  });

  it('sends the user id, not the discipline id, in the body', async () => {
    const { result } = renderHook(() => useSetUserDisciplines(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'u1',
        disciplineIds: [7],
        current: [],
      });
    });

    // The discipline is in the URL and the person is in the body; getting
    // that backwards still produces a well-formed request the route would
    // reject with a 400 nobody sees.
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      userId: 'u1',
      role: 'subject-expert',
    });
  });

  it('issues nothing at all when the set is unchanged', async () => {
    const { result } = renderHook(() => useSetUserDisciplines(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'u1',
        disciplineIds: [1, 2],
        current: [2, 1],
      });
    });

    // Order must not count as a change. Mutant this catches: diffing by
    // array equality rather than by set membership.
    expect(calls()).toEqual([]);
  });

  it('stops at the first failure rather than pressing on', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });

    const { result } = renderHook(() => useSetUserDisciplines(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ userId: 'u1', disciplineIds: [1, 2, 3], current: [] })
        .catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Two attempts, not three: "the second grant failed" is only actionable
    // if the caller knows the third never ran.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
