import { useIsSavingLessonContent } from '#/data-hooks/lesson-content-write';
import type { VersionedLesson } from './use-version-gate';
import { useVersionNotes } from './use-version-notes';
import { VersionNotesField } from './version-notes-field';

/**
 * The notes under the Version field. Like the version, it saves nothing
 * itself: what is typed is a draft, and the dialog's Save sends it.
 */
export const VersionNotesFieldContainer = ({
  lesson,
}: {
  lesson: VersionedLesson;
}) => {
  const notes = useVersionNotes(lesson);
  const isSaving = useIsSavingLessonContent(lesson.id);
  return (
    <VersionNotesField
      id={`lesson-version-notes-${lesson.id}`}
      value={notes.value}
      onChange={notes.setDraft}
      readOnly={isSaving}
      isLoading={notes.isLoading}
    />
  );
};
