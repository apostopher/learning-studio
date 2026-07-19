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
        lessons: [
          {
            id: 10,
            name: 'L',
            slug: 'l',
            rank: 1,
            isAvailable: false,
            hasDebrief: true,
            requiredSubscriptions: [],
            isConfigured: false,
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
});
