// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useCreateCourse } from '#/data-hooks/use-create-course';
import { useLinkLesson } from '#/data-hooks/use-link-lesson';
import { useUnlinkLesson } from '#/data-hooks/use-unlink-lesson';
import { useUpdateLibraryLesson } from '#/data-hooks/use-update-library-lesson';

const COURSE_ID = 4;

function makeHarness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  // Seeded so `isInvalidated` has something to report. Reading the cache back
  // is the point: a mocked `invalidateQueries` would have to be told whether
  // a prefix key matches a per-course entry, which is the thing under test.
  client.setQueryData(dataKeys.editorBoard(), []);
  client.setQueryData(dataKeys.orgLibrary(), {
    disciplines: [],
    untitled: [],
  });
  client.setQueryData(dataKeys.courseBoard(COURSE_ID), {
    course: { id: COURSE_ID },
    modules: [],
  });
  client.setQueryData(dataKeys.adminCourses(), []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const stale = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    // A full course row: `useCreateCourse` parses the response through
    // `courseSchema`, so a partial body fails before any invalidation runs.
    new Response(
      JSON.stringify({
        id: 9,
        name: 'CPL',
        slug: 'cpl',
        description: null,
        imageUrlAvif: null,
        imageUrlWebp: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

/**
 * The editor put a SECOND reader in front of data that used to have one. Every
 * write below changes something both surfaces draw, so every one has to settle
 * both — and the failure is quiet: React Query serves a cached entry that is
 * still inside its 30s `staleTime` without refetching, so the other screen
 * shows the old value for the rest of that mount.
 */
describe('writes that both editor surfaces read', () => {
  it('useCreateCourse adds the column to the rail, not just the course list', async () => {
    const { client, wrapper } = makeHarness();
    const { result } = renderHook(() => useCreateCourse(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'CPL' });
    });

    // The bug this pins: only `adminCourses()` was invalidated, so pressing
    // "New offering" on /admin/editor showed a success toast and left the
    // rail unchanged until a remount. Its three siblings — update, delete and
    // create-module — all invalidate the rail; only create was missed.
    expect(stale(client, dataKeys.adminCourses())).toBe(true);
    expect(stale(client, dataKeys.editorBoard())).toBe(true);
  });

  it('useUpdateLibraryLesson reaches the per-course board too', async () => {
    const { client, wrapper } = makeHarness();
    const { result } = renderHook(() => useUpdateLibraryLesson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ lessonId: 10, name: 'Renamed' });
    });

    // Renaming from the editor's lesson modal and then clicking a course
    // column's gear lands on a board whose cached entry is still fresh — it
    // showed the OLD name for the rest of that mount.
    expect(stale(client, dataKeys.editorBoard())).toBe(true);
    expect(stale(client, dataKeys.orgLibrary())).toBe(true);
    expect(stale(client, dataKeys.courseBoard(COURSE_ID))).toBe(true);
  });

  it('useLinkLesson and useUnlinkLesson settle the per-course board', async () => {
    const { client, wrapper } = makeHarness();
    const link = renderHook(() => useLinkLesson(), { wrapper });
    await act(async () => {
      await link.result.current.mutateAsync({ moduleId: 3, lessonId: 10 });
    });
    expect(stale(client, dataKeys.courseBoard(COURSE_ID))).toBe(true);

    const fresh = makeHarness();
    const unlink = renderHook(() => useUnlinkLesson(), {
      wrapper: fresh.wrapper,
    });
    await act(async () => {
      await unlink.result.current.mutateAsync({ moduleId: 3, lessonId: 10 });
    });
    // A lesson added to or removed from a course is exactly what that board
    // draws, so leaving it fresh shows a placement that is no longer there.
    expect(stale(fresh.client, dataKeys.courseBoard(COURSE_ID))).toBe(true);
  });
});
