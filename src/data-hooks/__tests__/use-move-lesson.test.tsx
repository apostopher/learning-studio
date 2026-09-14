// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMoveLesson } from '#/data-hooks/use-move-lesson';

function makeHarness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => vi.restoreAllMocks());

describe('useMoveLesson', () => {
  /**
   * The per-course board's move, mirroring `useMovePlacement`. The body is
   * the consumer: `fromModuleId` is the module the lesson was picked up
   * from, which the route guards the owner of and the writer pins the
   * UPDATE to (final review, Critical #1/#2). Without it the route 400s, so
   * a hook that drops it from the body breaks every drag on the board.
   */
  it('PATCHes the lesson with its source module, target module and both rank anchors', async () => {
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { result } = renderHook(() => useMoveLesson(1), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 9,
        fromModuleId: 30,
        targetModuleId: 40,
        prevLessonId: 3,
        nextLessonId: 7,
      });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/lessons/9');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      fromModuleId: 30,
      targetModuleId: 40,
      prevLessonId: 3,
      nextLessonId: 7,
    });
  });
});
