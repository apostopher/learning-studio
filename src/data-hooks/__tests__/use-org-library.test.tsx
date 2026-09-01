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
  // Round-2 review: narrowed to what this test actually proves. A queryFn
  // that returns the raw JSON with NO parsing at all would still pass this
  // test — LIBRARY round-trips through `toEqual` unchanged either way, and
  // the third test below (not this one) is what catches that. What THIS
  // test does kill: a queryFn parsing with the WRONG schema (e.g.
  // `orgEditorBoardSchema`, which expects a bare array) — LIBRARY's actual
  // shape (grouped disciplines with nested lessons) would fail that parse
  // and `isSuccess` would never become true.
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

  // Round-1 review (Minor 6): the previous version of this test stubbed
  // `ok: false`, so the queryFn's `!res.ok` check throws before the schema
  // ever runs — it was actually killing a mutant that drops the `!res.ok`
  // check (a queryFn that never throws on failure and resolves with `{}`
  // instead), not the schema mutant its old comment claimed. Mutant THIS
  // test kills: removing the `if (!res.ok) throw ...` guard entirely.
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

  // The actual schema-mismatch case: a 200 whose body doesn't match
  // `orgLibrarySchema` at all (an array, `orgEditorBoardSchema`'s shape).
  // Mutant this kills: a queryFn that returns the raw JSON instead of
  // `orgLibrarySchema.parse(...)`'d data — this would resolve successfully
  // with the garbage body instead of throwing.
  it('throws when the 200 body does not match the library schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ not: 'a library' }],
      }),
    );
    const { result } = renderHook(() => useOrgLibrary(), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
