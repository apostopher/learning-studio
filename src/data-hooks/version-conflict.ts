import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { type OrgLibrary, versionConflictSchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { patchLibraryLesson } from './patch-library-lesson';

/** A content write the server refused because of the lesson's version. */
export class VersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VersionConflictError';
  }
}

/** The message of a version 409; null for any other answer. */
export async function readVersionConflict(
  res: Response,
): Promise<string | null> {
  if (res.status !== 409) return null;
  const body = versionConflictSchema.safeParse(
    await res.json().catch(() => null),
  );
  return body.success ? body.data.error : null;
}

/** Throws a content write's failure: its version conflict, else `fallback`. */
export async function throwIfWriteFailed(
  res: Response,
  fallback: string,
): Promise<void> {
  if (res.ok) return;
  const conflict = await readVersionConflict(res);
  throw conflict ? new VersionConflictError(conflict) : new Error(fallback);
}

/** What every write of a lesson's content does to the caches once answered. */
export function useSettleContentWrite(lessonId: number) {
  const queryClient = useQueryClient();
  const refetchLibrary = () =>
    queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
  return {
    /**
     * The version just saved is put in the library cache at once, not on the
     * refetch: the dialog's next write asks this cache whether the lesson is
     * locked, and the old answer would refuse it. The refetch also drops a read
     * already in flight, which would bring the old answer back.
     */
    saved: (version: string | undefined) => {
      if (version !== undefined) {
        queryClient.setQueryData<OrgLibrary>(
          dataKeys.orgLibrary(),
          (library) =>
            library &&
            patchLibraryLesson(library, lessonId, (lesson) =>
              lesson.version === version
                ? lesson
                : // Accepted, so higher than any version a course has taken.
                  { ...lesson, version, versionCourseCount: 0 },
            ),
        );
      }
      refetchLibrary();
      // Both draw the version Disciplines is on.
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
    },
    /** Refused: what this page knew about the version is out of date. */
    failed: (error: Error) => {
      if (error instanceof VersionConflictError) refetchLibrary();
    },
  };
}

/** Whether any write of this lesson's content is in flight. */
export const useIsSavingLessonContent = (lessonId: number): boolean =>
  useIsMutating({ mutationKey: dataKeys.lessonContentWrite(lessonId) }) > 0;
