/**
 * The sentence a person reads before deleting a lesson. Only ever one no course
 * shows: a lesson in use is not offered for deletion (`LessonInUseNotice`).
 *
 * Renders inline content, not a block: `DeleteConfirmForm` already puts the
 * warning inside its own `<p>`.
 */
export const DeleteLessonWarning = ({ name }: { name: string }) => (
  <>
    <span className="font-medium text-primary">{name}</span> is not in any
    course. Deleting it erases the lesson itself — its video, its content and
    its settings — permanently, with no way back.
  </>
);
