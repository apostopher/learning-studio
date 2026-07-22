// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCourseOnboarding } from '#/data-hooks/use-course-onboarding';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useCourseOnboarding', () => {
  it('fetches the course onboarding questions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'a', text: 'Q1' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCourseOnboarding(4), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/courses/4/onboarding');
    expect(result.current.data).toEqual([{ id: 'a', text: 'Q1' }]);
  });
});
