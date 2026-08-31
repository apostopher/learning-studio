import { useUpdateEditorLessonConfig } from '#/data-hooks/use-update-editor-lesson-config';
import type { EditorBoardLesson, EditorBoardModule } from '#/lib/admin-schemas';
import { LessonQuickshot } from './lesson-quickshot';

/**
 * The quickshot chips on the org editor's board.
 *
 * The sibling of `LessonQuickshotContainer`, and the only difference is which
 * cache the write lands in — see `useUpdateEditorLessonConfig`. Two thin
 * containers over one presentational row rather than one container that
 * branches on a `surface` prop: the branch would be invisible at the call
 * site, and picking the wrong cache is exactly the failure that would then be
 * hard to see.
 */
export const EditorLessonQuickshotContainer = ({
  lesson,
  module,
  disabled,
}: {
  lesson: EditorBoardLesson;
  /** The lesson's own module: access depends on what the module allows. */
  module: EditorBoardModule;
  disabled?: boolean;
}) => {
  const updateConfig = useUpdateEditorLessonConfig();

  return (
    <LessonQuickshot
      lesson={lesson}
      module={module}
      disabled={disabled}
      onPatch={(patch) => updateConfig.mutate({ lessonId: lesson.id, patch })}
    />
  );
};
