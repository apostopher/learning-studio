// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateLibraryLesson } from '#/data-hooks/use-disciplines';

const CARD = {
  id: 91,
  name: 'Stalls',
  slug: 'stalls',
  isConfigured: false,
  isAvailable: false,
  courseCount: 0,
  courseIds: [],
  videoProvider: null,
  disciplineModuleId: 12,
  levels: [],
  requiredSubscriptions: [],
  hasDebrief: false,
  needsVideoWatch: false,
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(CARD), { status: 201 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe('useCreateLibraryLesson', () => {
  /**
   * The server files the lesson wherever the body says. A hook that sent
   * `{ name }` alone would still get a 201 — the lesson would just land in
   * Untitled instead of the module whose "Add lesson" was pressed.
   */
  it('sends the module the lesson was added from', async () => {
    const { wrapper } = harness();
    const { result } = renderHook(() => useCreateLibraryLesson(4), {
      wrapper,
    });
    await act(() =>
      result.current.mutateAsync({ name: 'Stalls', disciplineModuleId: 12 }),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/disciplines/4/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Stalls', disciplineModuleId: 12 }),
    });
  });

  it('sends null for Untitled', async () => {
    const { wrapper } = harness();
    const { result } = renderHook(() => useCreateLibraryLesson(4), {
      wrapper,
    });
    await act(() =>
      result.current.mutateAsync({ name: 'Stalls', disciplineModuleId: null }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Stalls',
      disciplineModuleId: null,
    });
  });
});
