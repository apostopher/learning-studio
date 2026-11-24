import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { queryKeys } from '#/hooks/data/keys';
import {
  type CourseLessonVersionRefusal,
  courseLessonVersionRefusalSchema,
} from '#/lib/admin-schemas';
import { dataKeys } from './keys';

type UpdateCourseLessonVersion = {
  courseId: number;
  lessonId: number;
  /** The version the dialog showed; the server refuses any other as stale. */
  toVersion: string;
};

/** An update the server refused, with a message for the person who asked. */
export class CourseLessonVersionError extends Error {
  constructor(
    message: string,
    readonly code?: CourseLessonVersionRefusal['code'],
  ) {
    super(message);
    this.name = 'CourseLessonVersionError';
  }
}

async function updateError(res: Response): Promise<Error> {
  if (res.status === 403) {
    return new CourseLessonVersionError(
      'Only someone who can edit this course can update its lessons.',
    );
  }
  const body = courseLessonVersionRefusalSchema.safeParse(
    await res.json().catch(() => null),
  );
  return body.success && (res.status === 404 || res.status === 409)
    ? new CourseLessonVersionError(body.data.error, body.data.code)
    : new Error(`Failed to update lesson (${res.status})`);
}

/** Move one course to the version of a lesson that Disciplines is on. */
export function useUpdateCourseLessonVersion() {
  const queryClient = useQueryClient();
  const invalidate = (queryKey: readonly unknown[]) =>
    queryClient.invalidateQueries({ queryKey });

  /** Awaited, so an update is over once the chips say what it did. */
  const refetchBoards = () =>
    Promise.all([
      invalidate(dataKeys.editorBoard()),
      invalidate(dataKeys.courseBoards()),
    ]);

  /** Everything else that shows this lesson as the course has it. */
  const invalidateReaders = (lessonId: number) => {
    invalidate(dataKeys.allLessonPosters());
    invalidate(dataKeys.lessonPlaybacks(lessonId));
    invalidate(dataKeys.orgLibrary());
    // The learner's pages of this course, where the same person has had them
    // open. By prefix: they are keyed by slugs this write does not know.
    invalidate(queryKeys.allCourseDetails());
    invalidate(queryKeys.allLessonMaterials());
    invalidate(queryKeys.allLessonPlaybacks());
    invalidate(dataKeys.allCourseProgressSummaries());
    invalidate(dataKeys.allDebriefStatuses());
    invalidate(dataKeys.allDebriefAttempts());
    invalidate(dataKeys.allLessonQuizResults());
  };

  return useMutation({
    mutationKey: dataKeys.updateCourseLessonVersion(),
    mutationFn: async ({
      courseId,
      lessonId,
      toVersion,
    }: UpdateCourseLessonVersion) => {
      const res = await fetch(
        `/api/admin/courses/${courseId}/lessons/${lessonId}/version`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toVersion }),
        },
      );
      if (!res.ok) throw await updateError(res);
    },
    onSuccess: (_data, { lessonId }) => {
      invalidateReaders(lessonId);
      return refetchBoards();
    },
    onError: (error, { lessonId }) => {
      if (!(error instanceof CourseLessonVersionError)) return;
      // Already there, by another hand: this page has the same to catch up on.
      if (error.code === 'current') invalidateReaders(lessonId);
      if (error.code === 'stale') invalidate(dataKeys.orgLibrary());
      return refetchBoards();
    },
  });
}

/** Whether this lesson is being moved in this course. */
export const useIsUpdatingCourseLesson = (
  courseId: number,
  lessonId: number,
): boolean =>
  useIsMutating({
    mutationKey: dataKeys.updateCourseLessonVersion(),
    predicate: ({ state }) => {
      const vars = state.variables as UpdateCourseLessonVersion | undefined;
      return vars?.courseId === courseId && vars.lessonId === lessonId;
    },
  }) > 0;
