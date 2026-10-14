// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useSetUserCourseLevel } from '#/data-hooks/use-user-levels';

const fetchMock = vi.fn();
let client: QueryClient;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 204,
    json: async () => ({}),
  });
  vi.stubGlobal('fetch', fetchMock);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const input = {
  profileId: 42,
  courseId: 3,
  level: 'advanced' as const,
  message: 'Moving you up.',
  note: 'per CFI',
};

describe('useSetUserCourseLevel', () => {
  it('PUTs the level to the profile in the variables, without the profileId in the body', async () => {
    const { result } = renderHook(() => useSetUserCourseLevel(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/users/42/levels');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    // The route's schema is `.strict()`: a profileId in the body is a 400.
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      courseId: 3,
      level: 'advanced',
      message: 'Moving you up.',
      note: 'per CFI',
    });
  });

  it('invalidates the directory, the offerings and that history after a save', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetUserCourseLevel(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    const keys = spy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(dataKeys.adminUsers());
    expect(keys).toContainEqual(dataKeys.allOfferings());
    expect(keys).toContainEqual(dataKeys.userLevelHistory(42, 3));
  });

  it('rejects with a reason a person can act on', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => {
        throw new Error('not json');
      },
    });
    const { result } = renderHook(() => useSetUserCourseLevel(), { wrapper });
    await expect(act(() => result.current.mutateAsync(input))).rejects.toThrow(
      'You do not have permission to change levels.',
    );
  });
});
