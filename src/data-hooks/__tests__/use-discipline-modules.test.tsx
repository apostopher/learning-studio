// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import {
  useCreateDisciplineModule,
  useDeleteDisciplineModule,
  usePlaceLibraryLesson,
  useRenameDisciplineModule,
  useReorderDisciplineModule,
} from '#/data-hooks/use-discipline-modules';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}
const invalidatedLibrary = (invalidate: unknown) =>
  (invalidate as { mock: { calls: unknown[][] } }).mock.calls.some(
    ([arg]) =>
      JSON.stringify((arg as { queryKey?: unknown })?.queryKey) ===
      JSON.stringify(dataKeys.orgLibrary()),
  );

describe('discipline module hooks', () => {
  it('creates a module in a discipline and refreshes the library', async () => {
    const { wrapper, invalidate } = harness();
    const { result } = renderHook(() => useCreateDisciplineModule(), {
      wrapper,
    });
    await act(() =>
      result.current.mutateAsync({ disciplineId: 4, name: 'Basics' }),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/disciplines/4/modules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Basics' }),
    });
    await waitFor(() => expect(invalidatedLibrary(invalidate)).toBe(true));
  });

  it('renames and reorders through PATCH on the module', async () => {
    const { wrapper } = harness();
    const rename = renderHook(() => useRenameDisciplineModule(), { wrapper });
    await act(() =>
      rename.result.current.mutateAsync({ moduleId: 7, name: 'Fundamentals' }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/discipline-modules/7',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Fundamentals' }),
      }),
    );
    const reorder = renderHook(() => useReorderDisciplineModule(), { wrapper });
    await act(() =>
      reorder.result.current.mutateAsync({
        moduleId: 7,
        prevModuleId: 6,
        nextModuleId: null,
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/discipline-modules/7',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ prevModuleId: 6, nextModuleId: null }),
      }),
    );
  });

  it('deletes through DELETE on the module', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { wrapper } = harness();
    const { result } = renderHook(() => useDeleteDisciplineModule(), {
      wrapper,
    });
    await act(() => result.current.mutateAsync({ moduleId: 7 }));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/discipline-modules/7', {
      method: 'DELETE',
    });
  });

  it('files a lesson through its library-placement route and refreshes the library even on failure (settled)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error:
            "This lesson is in Weather; that module is in Navigation. Lessons stay in their discipline — file it into one of Weather's modules.",
        }),
        { status: 400 },
      ),
    );
    const { wrapper, invalidate } = harness();
    const { result } = renderHook(() => usePlaceLibraryLesson(), { wrapper });
    await expect(
      act(() =>
        result.current.mutateAsync({
          lessonId: 10,
          disciplineModuleId: 7,
          prevLessonId: null,
          nextLessonId: 12,
        }),
      ),
    ).rejects.toThrow(/Lessons stay in their discipline/);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/lessons/10/library-placement',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          disciplineModuleId: 7,
          prevLessonId: null,
          nextLessonId: 12,
        }),
      },
    );
    await waitFor(() => expect(invalidatedLibrary(invalidate)).toBe(true));
  });

  it('turns a plain 403 into the discipline sentence', async () => {
    fetchMock.mockResolvedValue(new Response('Forbidden', { status: 403 }));
    const { wrapper } = harness();
    const { result } = renderHook(() => useCreateDisciplineModule(), {
      wrapper,
    });
    await expect(
      act(() => result.current.mutateAsync({ disciplineId: 4, name: 'x' })),
    ).rejects.toThrow(
      'Only an admin or one of this discipline’s subject experts can organise it.',
    );
  });

  it('uses a server sentence from 403 JSON over the fallback', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Custom sentence from the server',
        }),
        { status: 403 },
      ),
    );
    const { wrapper } = harness();
    const { result } = renderHook(() => useCreateDisciplineModule(), {
      wrapper,
    });
    await expect(
      act(() => result.current.mutateAsync({ disciplineId: 4, name: 'x' })),
    ).rejects.toThrow('Custom sentence from the server');
  });
});
