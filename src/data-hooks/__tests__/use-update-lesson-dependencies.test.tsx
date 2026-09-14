// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useUpdateLessonDependencies } from '#/data-hooks/use-update-lesson-sequencing';
import type { CourseBoard } from '#/lib/admin-schemas';

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

describe('useUpdateLessonDependencies', () => {
  /**
   * Final review, Important #4. A prerequisite list lives on ONE placement
   * `(module, lesson)`, and a course can show the same lesson twice — its
   * own module and a borrowed one — so the body names the module the
   * sequencing tab's row belongs to. The route resolves that module's OWNER
   * for its guard; without `moduleId` it falls back to "the lesson in this
   * course", which picks a copy.
   */
  it('PATCHes the lesson with the course, the placement’s module, and the slugs', async () => {
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { result } = renderHook(() => useUpdateLessonDependencies(2), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 9,
        moduleId: 40,
        dependsOn: ['intro'],
      });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/lessons/9');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      courseId: 2,
      moduleId: 40,
      dependsOn: ['intro'],
    });
  });

  it('patches only the named module’s copy of the lesson optimistically, leaving a duplicate copy alone', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const lesson = (id: number) => ({
      id,
      name: `L${id}`,
      slug: `l-${id}`,
      rank: 1,
      isAvailable: true,
      hasDebrief: false,
      needsVideoWatch: false,
      requiredSubscriptions: [],
      levels: [],
      isConfigured: true,
      quizQuestionCount: 0,
      dependsOn: [],
      videoProvider: null,
      videoRef: null,
    });
    const mod = (id: number, ownerId: number) => ({
      id,
      name: `M${id}`,
      slug: `m-${id}`,
      imageUrlAvif: null,
      imageUrlWebp: null,
      rank: id,
      requiredSubscriptions: [],
      dependsOn: [],
      sequentialLessons: false,
      learnerCount: 0,
      owner: { id: ownerId, name: `C${ownerId}` },
      otherCourseCount: 0,
      lessons: [lesson(9)],
    });
    const board: CourseBoard = {
      course: {
        id: 2,
        name: 'ITPS',
        slug: 'itps',
        description: null,
        imageUrlAvif: null,
        imageUrlWebp: null,
      },
      modules: [mod(10, 6), mod(40, 2)],
      remixes: [{ sourceCourseId: 6 }],
    };
    client.setQueryData(dataKeys.courseBoard(2), board);
    const { result } = renderHook(() => useUpdateLessonDependencies(2), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 9,
        moduleId: 40,
        dependsOn: ['intro'],
      });
    });

    const next = client.getQueryData<CourseBoard>(dataKeys.courseBoard(2));
    expect(next?.modules[1].lessons[0].dependsOn).toEqual([
      { lessonSlug: 'intro' },
    ]);
    expect(next?.modules[0].lessons[0].dependsOn).toEqual([]);
  });
});
