import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import type { OrgLibrary } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { patchLibraryLesson } from './patch-library-lesson';

/** What every write of a lesson's content does to the caches once saved. */
export function useSettleContentWrite(lessonId: number) {
  const queryClient = useQueryClient();
  /**
   * The version just saved is put in the library cache at once, not on the
   * refetch: until the lesson has it, the typed draft counts as unsaved and
   * the dialog's next write would send it again. The refetch also drops a read
   * already in flight, which would bring the old version back.
   */
  return (version: string | undefined) => {
    if (version !== undefined) {
      queryClient.setQueryData<OrgLibrary>(
        dataKeys.orgLibrary(),
        (library) =>
          library &&
          patchLibraryLesson(library, lessonId, (lesson) => ({
            ...lesson,
            version,
          })),
      );
    }
    queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    // Both draw the version Disciplines is on.
    queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
    queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
  };
}

/** Whether any write of this lesson's content is in flight. */
export const useIsSavingLessonContent = (lessonId: number): boolean =>
  useIsMutating({ mutationKey: dataKeys.lessonContentWrite(lessonId) }) > 0;
