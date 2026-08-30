// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOrgLibrary } from '#/data-hooks/use-org-library';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

const LIBRARY = {
  disciplines: [
    {
      id: 1,
      name: 'UAS',
      slug: 'uas',
      lessons: [
        {
          id: 9,
          name: 'Preflight',
          slug: 'preflight',
          isConfigured: true,
          isAvailable: true,
          courseCount: 2,
        },
      ],
    },
  ],
  untitled: [],
};

describe('useOrgLibrary', () => {
  it('fetches /api/admin/library and parses the response through the schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => LIBRARY,
      }),
    );
    const { result } = renderHook(() => useOrgLibrary(), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(LIBRARY);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/library');
  });

  // Mutant this kills: a queryFn that parses with the wrong schema (e.g.
  // orgEditorBoardSchema, an array) — a shape mismatch here would throw
  // instead of resolving, and this assertion would go red.
  it('throws on a genuine failure rather than resolving with garbage', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    const { result } = renderHook(() => useOrgLibrary(), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
