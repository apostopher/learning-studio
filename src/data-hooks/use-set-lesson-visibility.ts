import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
// `#/` not `@/`: vitest cannot resolve the `@/` alias.
import type { CourseBoard, OrgEditorBoard } from '#/lib/admin-schemas';
import { invalidateCourseLessons } from './invalidate-course-lessons';
import { dataKeys } from './keys';

interface SetLessonVisibility {
  courseId: number;
  lessonId: number;
  isVisible: boolean;
}

/** The course's own copies; the refetch settles what borrowers show. */
function withVisibility<
  M extends {
    owner: { id: number };
    lessons: { id: number; isAvailable: boolean }[];
  },
  B extends { modules: M[] },
>(board: B, { courseId, lessonId, isVisible }: SetLessonVisibility): B {
  return {
    ...board,
    modules: board.modules.map((m) =>
      m.owner.id === courseId
        ? {
            ...m,
            lessons: m.lessons.map((l) =>
              l.id === lessonId ? { ...l, isAvailable: isVisible } : l,
            ),
          }
        : m,
    ),
  };
}

/** Both boards that draw the eye, as `vars` leaves them. */
function write(client: QueryClient, vars: SetLessonVisibility) {
  client.setQueryData<OrgEditorBoard>(dataKeys.editorBoard(), (boards) =>
    boards?.map((b) => withVisibility(b, vars)),
  );
  client.setQueryData<CourseBoard>(
    dataKeys.courseBoard(vars.courseId),
    (board) => board && withVisibility(board, vars),
  );
}

/**
 * Show a lesson to one course's learners, or hide it from them: the eye, on the
 * editor's rail and on the course's own board. Other courses and Disciplines do
 * not change.
 *
 * Eyes are clicked in a run, so refetching waits for the last save: an earlier
 * one's would put the later eyes back for a moment. A failed save puts back its
 * own eye only, for the same reason.
 */
export function useSetLessonVisibility() {
  const queryClient = useQueryClient();
  const mutationKey = dataKeys.setLessonVisibility();
  return useMutation({
    mutationKey,
    mutationFn: async ({
      courseId,
      lessonId,
      isVisible,
    }: SetLessonVisibility) => {
      const res = await fetch(
        `/api/admin/courses/${courseId}/lessons/${lessonId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ isVisible }),
        },
      );
      if (res.status === 403)
        throw new Error(
          'Only an admin or this course’s staff can show or hide its lessons.',
        );
      if (!res.ok)
        throw new Error(
          `Could not ${isVisible ? 'show' : 'hide'} the lesson (${res.status})`,
        );
    },
    onMutate: async (vars) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: dataKeys.editorBoard() }),
        queryClient.cancelQueries({
          queryKey: dataKeys.courseBoard(vars.courseId),
        }),
      ]);
      write(queryClient, vars);
    },
    onError: (error, vars) => {
      write(queryClient, { ...vars, isVisible: !vars.isVisible });
      toast.error(error.message);
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) === 1)
        invalidateCourseLessons(queryClient);
    },
  });
}
