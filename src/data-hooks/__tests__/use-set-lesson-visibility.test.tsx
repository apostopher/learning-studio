// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useSetLessonVisibility } from '#/data-hooks/use-set-lesson-visibility';
import { queryKeys } from '#/hooks/data/keys';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const lesson = (id: number) => ({ id, isAvailable: true });
const board = (courseId: number, owners: number[]) => ({
  course: { id: courseId },
  modules: owners.map((owner, i) => ({
    id: i,
    owner: { id: owner },
    lessons: [lesson(10), lesson(11)],
  })),
});

/** Course 4 has its own module and one borrowed from 6; course 5 has its own. */
function harness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  client.setQueryData(dataKeys.editorBoard(), [
    board(4, [6, 4]),
    board(5, [5]),
  ]);
  client.setQueryData(dataKeys.courseBoard(4), board(4, [6, 4]));
  const { result } = renderHook(() => useSetLessonVisibility(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  type Board = ReturnType<typeof board>;
  const hidden = (b?: Board) =>
    b?.modules.flatMap((m) =>
      m.lessons
        .filter((l) => !l.isAvailable)
        .map((l) => `${b.course.id}/${m.owner.id}/${l.id}`),
    );
  return {
    client,
    result,
    onRail: () =>
      client
        .getQueryData<Board[]>(dataKeys.editorBoard())
        ?.flatMap((b) => hidden(b)),
    onBoard: () => hidden(client.getQueryData<Board>(dataKeys.courseBoard(4))),
  };
}
const HIDE = { courseId: 4, lessonId: 10, isVisible: false };

afterEach(() => {
  vi.restoreAllMocks();
  toastError.mockClear();
});

describe('useSetLessonVisibility', () => {
  it('asks for that lesson in that course', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));
    const { result } = harness();
    await act(async () => {
      await result.current.mutateAsync(HIDE);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/courses/4/lessons/10');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ isVisible: false });
  });

  it('shows it at once on both boards, in that course’s own module only', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const { result, onRail, onBoard } = harness();
    act(() => result.current.mutate(HIDE));
    await waitFor(() => expect(onRail()).toEqual(['4/4/10']));
    expect(onBoard()).toEqual(['4/4/10']);
  });

  it.each([
    [403, 'Only an admin or this course’s staff can show or hide its lessons.'],
    [500, 'Could not hide the lesson (500)'],
  ])('refused with %i, puts its own eye back, not a later one, and says why', async (status, why) => {
    let answer: (res: Response) => void = () => {};
    const first = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(new Promise(() => {}));
    const { result, onRail } = harness();
    act(() => result.current.mutate(HIDE));
    act(() => result.current.mutate({ ...HIDE, lessonId: 11 }));
    await waitFor(() => expect(onRail()).toEqual(['4/4/10', '4/4/11']));
    await act(async () => answer(new Response('', { status })));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(why));
    expect(onRail()).toEqual(['4/4/11']);
  });

  it('refreshes the boards and the learner pages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const { client, result } = harness();
    const details = [...queryKeys.allCourseDetails(), 'itps'];
    client.setQueryData(details, {});
    await act(async () => {
      await result.current.mutateAsync(HIDE);
    });
    for (const key of [
      dataKeys.editorBoard(),
      dataKeys.courseBoard(4),
      details,
    ]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
