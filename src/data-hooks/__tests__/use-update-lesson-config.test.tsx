// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CourseBoard } from '#/lib/admin-schemas';
import { dataKeys } from '../keys';
import { useUpdateLessonConfig } from '../use-update-lesson-config';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const COURSE_ID = 7;

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
    modules: [
      {
        id: 1,
        name: 'M',
        slug: 'm',
        imageUrlAvif: null,
        imageUrlWebp: null,
        rank: 1,
        requiredSubscriptions: ['associate'],
        dependsOn: [],
        sequentialLessons: true,
        learnerCount: 0,
        lessons: [
          {
            id: 10,
            name: 'L',
            slug: 'l',
            rank: 1,
            isAvailable: false,
            hasDebrief: true,
            needsVideoWatch: true,
            requiredSubscriptions: [],
            levels: [],
            isConfigured: false,
            quizQuestionCount: 0,
            dependsOn: [],
            videoProvider: null,
            videoRef: null,
          },
        ],
      },
    ],
  };
  client.setQueryData(dataKeys.courseBoard(COURSE_ID), board);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

function lessonInCache(client: QueryClient) {
  const data = client.getQueryData<CourseBoard>(
    dataKeys.courseBoard(COURSE_ID),
  );
  return data?.modules[0].lessons[0];
}

afterEach(() => vi.restoreAllMocks());

describe('useUpdateLessonConfig', () => {
  it('optimistically patches the lesson in the board cache', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const { result } = renderHook(() => useUpdateLessonConfig(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 10,
        patch: { isAvailable: true },
      });
    });

    const board = client.getQueryData<CourseBoard>(
      dataKeys.courseBoard(COURSE_ID),
    );
    expect(board?.modules[0].lessons[0].isAvailable).toBe(true);
  });

  it('rolls back the cache on error', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad', { status: 500 }),
    );
    const { result } = renderHook(() => useUpdateLessonConfig(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current
        .mutateAsync({ lessonId: 10, patch: { isAvailable: true } })
        .catch(() => {});
    });

    const board = client.getQueryData<CourseBoard>(
      dataKeys.courseBoard(COURSE_ID),
    );
    expect(board?.modules[0].lessons[0].isAvailable).toBe(false);
  });

  it('PATCHes the patch as JSON to the lesson route', async () => {
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { result } = renderHook(() => useUpdateLessonConfig(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 10,
        patch: { hasDebrief: false },
      });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/lessons/10');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ hasDebrief: false });
  });

  it('flips the board cache before the request resolves', async () => {
    const { client, wrapper } = makeHarness();
    let release: (() => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Response(null, { status: 200 }));
        }),
    );
    const { result } = renderHook(() => useUpdateLessonConfig(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ lessonId: 10, patch: { isAvailable: true } });
    });

    // The point of the whole feature: the chip already reads its new value
    // with the request still open, so no spinner is needed.
    expect(lessonInCache(client)?.isAvailable).toBe(true);
    await act(async () => {
      release?.();
    });
  });

  it('invalidates once for a run of taps, not once per tap', async () => {
    const { client, wrapper } = makeHarness();
    const releases: Array<() => void> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve(new Response(null, { status: 200 })));
        }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateLessonConfig(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ lessonId: 10, patch: { isAvailable: true } });
      result.current.mutate({ lessonId: 10, patch: { hasDebrief: false } });
    });

    await act(async () => {
      releases[0]?.();
    });
    // The first settle must NOT refetch: the server has not taken the second
    // write yet, so a refetch here would snap the second chip back.
    expect(invalidateSpy).not.toHaveBeenCalled();

    await act(async () => {
      releases[1]?.();
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps a later tap when an earlier one fails mid-run', async () => {
    const { client, wrapper } = makeHarness();
    const settles: Array<(ok: boolean) => void> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          settles.push((ok) =>
            resolve(new Response(null, { status: ok ? 200 : 500 })),
          );
        }),
    );
    const { result } = renderHook(() => useUpdateLessonConfig(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ lessonId: 10, patch: { isAvailable: true } });
      result.current.mutate({ lessonId: 10, patch: { hasDebrief: false } });
    });

    await act(async () => {
      settles[0]?.(false);
    });

    // Rolling back to the first tap's snapshot would erase the second tap the
    // author already watched take effect.
    expect(lessonInCache(client)?.hasDebrief).toBe(false);

    await act(async () => {
      settles[1]?.(true);
    });
  });
});
