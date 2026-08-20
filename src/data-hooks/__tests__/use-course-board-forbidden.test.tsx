// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD_FORBIDDEN, useCourseBoard } from '#/data-hooks/use-course-board';

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

function respondWith(status: number, body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

/**
 * `structure:read` is course-scoped, so a 403 here is the ordinary answer for
 * an SME who opened `/admin/7/editor` for a course they do not staff. Throwing
 * made the container say "Failed to load the board." — a refusal reported as a
 * fault, with nothing saying what would unlock it.
 */
describe('useCourseBoard — a refusal is not a failure', () => {
  it('reports a 403 as data the container can explain, not an error', async () => {
    respondWith(403);
    const { wrapper } = setup();

    const { result } = renderHook(() => useCourseBoard(7), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.data).toBe(BOARD_FORBIDDEN);
    expect(result.current.error).toBeNull();
  });

  it('keeps 404 meaning "no such course", distinct from the refusal', async () => {
    respondWith(404);
    const { wrapper } = setup();

    const { result } = renderHook(() => useCourseBoard(7), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.data).toBeNull();
  });

  it('still throws on a genuine failure', async () => {
    respondWith(500);
    const { wrapper } = setup();

    const { result } = renderHook(() => useCourseBoard(7), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});
