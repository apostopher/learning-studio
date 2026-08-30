// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEditorBoard } from '#/data-hooks/use-editor-board';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

const BOARDS = [
  {
    course: {
      id: 2,
      name: 'Mini',
      slug: 'mini',
      description: null,
      imageUrlAvif: null,
      imageUrlWebp: null,
    },
    modules: [],
  },
];

describe('useEditorBoard', () => {
  it('fetches /api/admin/editor with no course filter and parses the response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => BOARDS }),
    );
    const { result } = renderHook(() => useEditorBoard(), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(BOARDS);
    // Mutant this kills: a hook that accepts a courseId and appends it as a
    // query param — the request would carry it and this exact-URL assertion
    // would fail. `useEditorBoard` takes no argument at all, by design: the
    // route it calls has no filter (its org-scoped join is the only
    // tenant-isolation boundary).
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/editor');
  });

  it('throws on a genuine failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    const { result } = renderHook(() => useEditorBoard(), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
