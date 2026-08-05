// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '../keys';
import { useSaveCredential } from '../use-save-credential';

const COURSE_ID = 7;

function makeHarness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => vi.restoreAllMocks());

describe('useSaveCredential', () => {
  // Regression guard: saving a corrected provider credential used to
  // invalidate only courseCredentials, not lessonPosters — so fixing a wrong
  // API key left the board's tiles serving whatever the last (wrong or
  // absent) sweep produced for the full 30-minute lessonPosters staleTime.
  // Asserted on the query client's actual invalidateQueries calls, the real
  // consumer of this mutation's onSuccess.
  it('invalidates the lessonPosters cache for the course, alongside courseCredentials', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSaveCredential(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        provider: 'synthesia',
        apiKey: 'corrected-key',
      });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      ([arg]) => arg?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(
      dataKeys.courseCredentials(COURSE_ID),
    );
    expect(invalidatedKeys).toContainEqual(dataKeys.lessonPosters(COURSE_ID));
  });
});
