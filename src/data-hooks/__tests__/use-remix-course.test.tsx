// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import {
  useRemixCourse,
  useUnremixCourse,
} from '#/data-hooks/use-remix-course';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ moduleCount: 7 }), { status: 201 }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useRemixCourse', () => {
  it('POSTs the source to the remixer’s remixes route and invalidates the rail and boards', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRemixCourse(), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ courseId: 2, sourceCourseId: 6 });
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/courses/2/remixes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceCourseId: 6 }),
    });
    await waitFor(() => {
      const keys = invalidate.mock.calls.map((c) =>
        JSON.stringify(c[0]?.queryKey),
      );
      expect(keys).toContain(JSON.stringify(dataKeys.editorBoard()));
      expect(keys).toContain(JSON.stringify(dataKeys.courseBoards()));
      expect(keys).toContain(JSON.stringify(dataKeys.adminCourses()));
    });
  });

  it('surfaces the server’s sentence on failure', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'This course already remixes that one' }),
        { status: 409 },
      ),
    );
    const client = new QueryClient();
    const { result } = renderHook(() => useRemixCourse(), {
      wrapper: wrapper(client),
    });
    await expect(
      act(() => result.current.mutateAsync({ courseId: 2, sourceCourseId: 6 })),
    ).rejects.toThrow('This course already remixes that one');
  });
});

describe('useUnremixCourse', () => {
  it('DELETEs the remixer/source pair', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ moduleCount: 7 }), { status: 200 }),
    );
    const client = new QueryClient();
    const { result } = renderHook(() => useUnremixCourse(), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ courseId: 2, sourceCourseId: 6 });
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/courses/2/remixes/6', {
      method: 'DELETE',
    });
  });
});
