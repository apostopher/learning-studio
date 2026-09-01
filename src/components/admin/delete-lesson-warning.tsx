/**
 * The sentence a person reads before deleting a lesson.
 *
 * Split out of the dialog container for one reason: this copy is the whole
 * safety mechanism. Deleting a lesson and removing it from a module are two
 * different destructive acts wearing similar words, and the only thing
 * standing between them is what this component says. It is therefore a pure
 * function of its props that can be rendered and read back in a test, rather
 * than a string buried in a container behind a Jotai atom and a mutation.
 *
 * Renders inline content, not a block: `DeleteConfirmForm` already puts the
 * warning inside its own `<p>`.
 */
export const DeleteLessonWarning = ({
  name,
  courseCount,
  removeControlLabel,
}: {
  name: string;
  /** How many courses currently teach this lesson — the blast radius. */
  courseCount: number;
  /**
   * The accessible name of the remove control on the surface the reader is
   * looking at, or `null` where that surface has none. Never a hard-coded
   * phrase: this dialog is opened from two screens whose cards differ, and
   * naming a control the reader cannot find is worse than not naming one.
   */
  removeControlLabel: string | null;
}) => {
  const lessonName = <span className="font-medium text-primary">{name}</span>;

  // A lesson nothing teaches has no blast radius to name, and no placement to
  // undo either — there is no gentler act to point at.
  if (courseCount === 0) {
    return (
      <>
        {lessonName} is not in any course yet. Deleting it erases the lesson
        itself — its video, its content and its settings — permanently, with no
        way back.
      </>
    );
  }

  return (
    <>
      {lessonName}{' '}
      {courseCount === 1
        ? 'is taught by 1 course. Deleting it takes the lesson out of that course'
        : `is taught by ${courseCount} courses. Deleting it takes the lesson out of all ${courseCount}`}{' '}
      and erases every learner's progress on it — permanently, with no way back.{' '}
      <GentlerAct
        courseCount={courseCount}
        removeControlLabel={removeControlLabel}
      />
    </>
  );
};

/**
 * The sentence that keeps "delete" from reading as a synonym of "remove": it
 * names the reversible act and where to perform it.
 *
 * Two forms, because the two screens that open this dialog are not the same.
 * The knowledge editor's lesson card carries a remove control, so the copy
 * quotes it by the exact name it wears. The per-course board's card has none,
 * so the copy sends the reader to the screen that does rather than describing
 * a button that is not there.
 */
const GentlerAct = ({
  courseCount,
  removeControlLabel,
}: {
  courseCount: number;
  removeControlLabel: string | null;
}) => {
  const keepsIt =
    courseCount === 1
      ? 'keep the lesson in the library'
      : 'keep it in the other courses';

  if (removeControlLabel === null) {
    return (
      <>
        To take it out of {courseCount === 1 ? 'that' : 'one'} module and{' '}
        {keepsIt}, cancel and do that from the knowledge library editor — this
        screen has no way to undo a placement.
      </>
    );
  }

  return (
    <>
      To take it out of {courseCount === 1 ? 'that' : 'one'} module and{' '}
      {keepsIt}, cancel and use the “{removeControlLabel}” control on its card
      instead.
    </>
  );
};
