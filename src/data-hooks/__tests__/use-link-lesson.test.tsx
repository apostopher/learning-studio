// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useCopyLibraryModule } from '#/data-hooks/use-copy-library-module';
import { useDeleteModule } from '#/data-hooks/use-delete-module';
import { useLinkLesson } from '#/data-hooks/use-link-lesson';
import { useUnlinkLesson } from '#/data-hooks/use-unlink-lesson';
import { queryKeys } from '#/hooks/data/keys';

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

/** The copy's body, cut to what its schema needs. */
const COPIED = {
  module: {
    id: 3,
    name: 'Approaches',
    slug: 'approaches',
    rank: 1,
    requiredSubscriptions: [],
    sequentialLessons: false,
    imageUrlAvif: null,
    imageUrlWebp: null,
    dependsOn: [],
    learnerCount: 0,
    owner: { id: 4, name: 'Course' },
    otherCourseCount: 0,
    lessons: [],
  },
  placedLessonIds: [9],
  skipped: [],
};

/**
 * Removing a lesson and adding it back is how a course updates it, and each
 * half can be done by the lesson or by its module: whichever way, the person
 * doing it must not go on seeing the old lesson in the same tab.
 */
describe('every way a lesson leaves or joins a course', () => {
  it.each([
    ['useLinkLesson', () => useLinkLesson(), { moduleId: 40, lessonId: 9 }],
    ['useUnlinkLesson', () => useUnlinkLesson(), { moduleId: 40, lessonId: 9 }],
    ['useDeleteModule', () => useDeleteModule(4), 40],
    [
      'useCopyLibraryModule',
      () => useCopyLibraryModule(),
      { courseId: 4, disciplineModuleId: 7, afterModuleId: null },
    ],
  ] as const)('%s refreshes the learner pages', async (_name, useHook, vars) => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(COPIED), { status: 200 }),
    );
    const shown = [
      [...dataKeys.allLessonPosters(), 4],
      [...queryKeys.allCourseDetails(), 'itps'],
      [...queryKeys.allLessonMaterials(), 'itps', 'wx'],
      [...queryKeys.allLessonPlaybacks(), 'itps', 'wx'],
      [...dataKeys.allCourseProgressSummaries(), 'itps'],
    ];
    for (const key of shown) client.setQueryData(key, {});
    const { result } = renderHook(
      useHook as () => { mutateAsync: (v: unknown) => Promise<unknown> },
      { wrapper },
    );
    await act(async () => {
      await result.current.mutateAsync(vars);
    });
    for (const key of shown) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});

describe('useLinkLesson', () => {
  it('POSTs lessonId to the module lessons route', async () => {
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 1 }), { status: 200 }),
      );
    const { result } = renderHook(() => useLinkLesson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 40, lessonId: 9 });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/modules/40/lessons');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ lessonId: 9 });
  });

  // Mutant this kills: an onSuccess that invalidates only the editor board
  // (or only the library) — the badge count on the untouched key would go
  // stale with nothing telling the admin it's wrong.
  it('invalidates BOTH the editor board and the library on success', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useLinkLesson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 40, lessonId: 9 });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => call[0]?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(dataKeys.editorBoard());
    expect(invalidatedKeys).toContainEqual(dataKeys.orgLibrary());
  });

  // Adding a lesson back is how a course updates it: whatever plays or shows
  // it has to be read again.
  it('refreshes everything that shows the lesson as the course has it', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    );
    const { result } = renderHook(() => useLinkLesson(), { wrapper });
    const shown = [
      dataKeys.lessonPlaybacks(9),
      [...dataKeys.allLessonPosters(), 4],
      [...queryKeys.allCourseDetails(), 'itps'],
      [...queryKeys.allLessonMaterials(), 'itps', 'wx'],
      [...queryKeys.allLessonPlaybacks(), 'itps', 'wx'],
      [...dataKeys.allCourseProgressSummaries(), 'itps'],
      [...dataKeys.allDebriefStatuses(), 'itps', 'wx'],
      [...dataKeys.allDebriefAttempts(), 'itps', 'wx'],
      [...dataKeys.allLessonQuizResults(), 'wx'],
    ];
    for (const key of shown) client.setQueryData(key, {});
    const other = dataKeys.lessonPlaybacks(10);
    client.setQueryData(other, {});

    await act(async () => {
      await result.current.mutateAsync({ moduleId: 40, lessonId: 9 });
    });

    for (const key of shown) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });

  // Round-1 review (Minor 5): the hook used to hardcode this sentence,
  // duplicating the route's own `{error}` body. Mutant this kills: a
  // hardcoded string that no longer matches what the route actually says.
  it("surfaces the server's own 409 message rather than a hardcoded one", async () => {
    const { wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'This course already teaches this lesson (from server)',
        }),
        { status: 409 },
      ),
    );
    const { result } = renderHook(() => useLinkLesson(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ moduleId: 40, lessonId: 9 })
        .catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe(
        'This course already teaches this lesson (from server)',
      ),
    );
  });

  it('falls back to a fixed message if the 409 body has no error field', async () => {
    const { wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', { status: 409 }),
    );
    const { result } = renderHook(() => useLinkLesson(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ moduleId: 40, lessonId: 9 })
        .catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe(
        'This course already teaches this lesson',
      ),
    );
  });

  it('does not invalidate on failure', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('conflict', { status: 409 }),
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useLinkLesson(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ moduleId: 40, lessonId: 9 })
        .catch(() => {});
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
