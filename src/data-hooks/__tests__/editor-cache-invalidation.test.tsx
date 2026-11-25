// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useCopyLibraryModule } from '#/data-hooks/use-copy-library-module';
import { useCreateCourse } from '#/data-hooks/use-create-course';
import { useDeleteCourse } from '#/data-hooks/use-delete-course';
import { useDeleteLesson } from '#/data-hooks/use-delete-lesson';
import { useDeleteModule } from '#/data-hooks/use-delete-module';
import { useLinkLesson } from '#/data-hooks/use-link-lesson';
import { useMoveLesson } from '#/data-hooks/use-move-lesson';
import { useMovePlacement } from '#/data-hooks/use-move-placement';
import {
  useRemixCourse,
  useUnremixCourse,
} from '#/data-hooks/use-remix-course';
import { useUnlinkLesson } from '#/data-hooks/use-unlink-lesson';
import {
  useRenameLibraryLesson,
  useUpdateLibraryLesson,
} from '#/data-hooks/use-update-library-lesson';

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

type Wrapper = ReturnType<typeof makeHarness>['wrapper'];

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
  placedLessonIds: [10],
  skipped: [],
};

/** Make one write through its hook. */
const run =
  <TVars,>(
    useHook: () => { mutateAsync: (vars: TVars) => Promise<unknown> },
    vars: TVars,
  ) =>
  async (wrapper: Wrapper) => {
    const { result } = renderHook(useHook, { wrapper });
    await act(async () => {
      await result.current.mutateAsync(vars);
    });
  };

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
    // "New course" on /admin/editor showed a success toast and left the
    // rail unchanged until a remount. Its three siblings — update, delete and
    // create-module — all invalidate the rail; only create was missed.
    expect(stale(client, dataKeys.adminCourses())).toBe(true);
    expect(stale(client, dataKeys.editorBoard())).toBe(true);
  });

  it('a rename or an availability change reaches the per-course board too', async () => {
    const renamed = makeHarness();
    const rename = renderHook(() => useRenameLibraryLesson(10), {
      wrapper: renamed.wrapper,
    });
    await act(async () => {
      await rename.result.current.mutateAsync({ name: 'Renamed' });
    });

    const hidden = makeHarness();
    const update = renderHook(() => useUpdateLibraryLesson(), {
      wrapper: hidden.wrapper,
    });
    await act(async () => {
      await update.result.current.mutateAsync({
        lessonId: 10,
        isAvailable: false,
      });
    });

    // Editing from the lesson modal and then clicking a course column's gear
    // lands on a board whose cached entry is still fresh — it showed the OLD
    // value for the rest of that mount.
    for (const { client } of [renamed, hidden]) {
      expect(stale(client, dataKeys.editorBoard())).toBe(true);
      expect(stale(client, dataKeys.orgLibrary())).toBe(true);
      expect(stale(client, dataKeys.courseBoard(COURSE_ID))).toBe(true);
    }
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

/**
 * Each of these changes which courses show a lesson, which the library lists:
 * left fresh, it would count courses that are gone.
 */
describe('membership changes reach the library, which lists the courses', () => {
  const move = {
    lessonId: 10,
    fromModuleId: 3,
    targetModuleId: 4,
    prevLessonId: null,
    nextLessonId: null,
  };
  const remix = { courseId: 4, sourceCourseId: 6 };

  it.each<[string, (wrapper: Wrapper) => Promise<unknown>]>([
    ['useLinkLesson', run(useLinkLesson, { moduleId: 3, lessonId: 10 })],
    ['useUnlinkLesson', run(useUnlinkLesson, { moduleId: 3, lessonId: 10 })],
    ['useMovePlacement', run(useMovePlacement, move)],
    ['useMoveLesson', run(() => useMoveLesson(COURSE_ID), move)],
    ['useRemixCourse', run(useRemixCourse, remix)],
    ['useUnremixCourse', run(useUnremixCourse, remix)],
    ['useDeleteModule', run(() => useDeleteModule(COURSE_ID), 3)],
    ['useCreateCourse', run(useCreateCourse, { name: 'CPL' })],
    ['useDeleteCourse', run(useDeleteCourse, COURSE_ID)],
    ['useDeleteLesson', run(useDeleteLesson, 10)],
  ])('%s', async (_name, write) => {
    const { client, wrapper } = makeHarness();
    await write(wrapper);
    expect(stale(client, dataKeys.orgLibrary())).toBe(true);
  });

  it('useCopyLibraryModule', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(COPIED), { status: 201 }),
    );
    const { client, wrapper } = makeHarness();
    await run(useCopyLibraryModule, {
      courseId: COURSE_ID,
      disciplineModuleId: 2,
      afterModuleId: null,
    })(wrapper);
    expect(stale(client, dataKeys.orgLibrary())).toBe(true);
  });

  it.each([
    ['useMovePlacement', run(useMovePlacement, move)],
    ['useMoveLesson', run(() => useMoveLesson(COURSE_ID), move)],
  ])('%s, even when it failed: the server may have kept it', async (_name, write) => {
    vi.mocked(fetch).mockResolvedValue(new Response('no', { status: 500 }));
    const { client, wrapper } = makeHarness();
    await write(wrapper).catch(() => {});
    expect(stale(client, dataKeys.orgLibrary())).toBe(true);
  });
});
