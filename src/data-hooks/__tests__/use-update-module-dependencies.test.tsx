// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CourseBoard } from '#/lib/admin-schemas';
import { dataKeys } from '../keys';
import { useUpdateModuleDependencies } from '../use-update-module-dependencies';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const COURSE_ID = 7;

const boardModule = (id: number, slug: string, dependsOn: string[] = []) => ({
  id,
  name: slug.toUpperCase(),
  slug,
  imageUrlAvif: null,
  imageUrlWebp: null,
  rank: id,
  requiredSubscriptions: [],
  dependsOn,
  sequentialLessons: true,
  learnerCount: 0,
  lessons: [],
});

function makeHarness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const board: CourseBoard = {
    course: {
      id: COURSE_ID,
      name: 'C',
      slug: 'c',
      description: null,
      imageUrlAvif: null,
      imageUrlWebp: null,
    },
    modules: [boardModule(1, 'a'), boardModule(2, 'b', ['a'])],
  };
  client.setQueryData(dataKeys.courseBoard(COURSE_ID), board);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => {
  vi.restoreAllMocks();
  toastError.mockClear();
});

describe('useUpdateModuleDependencies', () => {
  it('PATCHes the whole array to the module route', async () => {
    // The consumer here is the server, and the array is the payload it acts
    // on — asserting the cache instead would pass even if the body were empty.
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { result } = renderHook(
      () => useUpdateModuleDependencies(COURSE_ID),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 2, dependsOn: ['a', 'c'] });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/modules/2');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      dependsOn: ['a', 'c'],
    });
  });

  it('sends an empty array when the last prerequisite is removed', async () => {
    // Clearing must reach the server as `[]`, not be dropped as falsy.
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { result } = renderHook(
      () => useUpdateModuleDependencies(COURSE_ID),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 2, dependsOn: [] });
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      dependsOn: [],
    });
  });

  it('optimistically patches the module in the board cache', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const { result } = renderHook(
      () => useUpdateModuleDependencies(COURSE_ID),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 1, dependsOn: ['b'] });
    });

    const board = client.getQueryData<CourseBoard>(
      dataKeys.courseBoard(COURSE_ID),
    );
    expect(board?.modules[0].dependsOn).toEqual(['b']);
  });

  it('leaves sibling modules untouched', async () => {
    // The optimistic patch maps over every module; a missing id guard would
    // rewrite them all with the same array.
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const { result } = renderHook(
      () => useUpdateModuleDependencies(COURSE_ID),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 1, dependsOn: ['b'] });
    });

    const board = client.getQueryData<CourseBoard>(
      dataKeys.courseBoard(COURSE_ID),
    );
    expect(board?.modules[1].dependsOn).toEqual(['a']);
  });

  it('rolls back the cache on error', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad', { status: 500 }),
    );
    const { result } = renderHook(
      () => useUpdateModuleDependencies(COURSE_ID),
      { wrapper },
    );

    await act(async () => {
      await result.current
        .mutateAsync({ moduleId: 2, dependsOn: [] })
        .catch(() => {});
    });

    const board = client.getQueryData<CourseBoard>(
      dataKeys.courseBoard(COURSE_ID),
    );
    expect(board?.modules[1].dependsOn).toEqual(['a']);
  });

  it('tells the admin to reload when the server rejects a cycle', async () => {
    // A 409 means the client's board was stale, so the copy has to say that
    // rather than read as a generic failure the admin should just retry.
    const { wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'cycle' }), { status: 409 }),
    );
    const { result } = renderHook(
      () => useUpdateModuleDependencies(COURSE_ID),
      { wrapper },
    );

    await act(async () => {
      await result.current
        .mutateAsync({ moduleId: 1, dependsOn: ['b'] })
        .catch(() => {});
    });

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('loop'));
  });

  it('uses the generic message for a non-cycle failure', async () => {
    const { wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad', { status: 500 }),
    );
    const { result } = renderHook(
      () => useUpdateModuleDependencies(COURSE_ID),
      { wrapper },
    );

    await act(async () => {
      await result.current
        .mutateAsync({ moduleId: 1, dependsOn: ['b'] })
        .catch(() => {});
    });

    expect(toastError).toHaveBeenCalledWith(
      expect.not.stringContaining('loop'),
    );
  });
});
