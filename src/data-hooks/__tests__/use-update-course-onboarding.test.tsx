// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUpdateCourseOnboarding } from '#/data-hooks/use-update-course-onboarding';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useUpdateCourseOnboarding', () => {
  it('PUTs the questions and returns saved', async () => {
    const questions = [{ id: 'a', text: 'Q1' }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => questions,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateCourseOnboarding(4), {
      wrapper: wrapper(),
    });
    result.current.mutate(questions);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/courses/4/onboarding');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ questions });
    expect(result.current.data).toEqual(questions);
  });
});
