/**
 * The sentence a person reads before deleting a lesson.
 *
 * Split out of the dialog container for one reason: this copy is the whole
 * safety mechanism. Deleting a lesson and removing it from a module are two
 * different destructive acts wearing similar words, and the only thing
 * standing between them is what this component says. It is therefore a pure
 * function of `(name, courseCount)` that can be rendered and read back in a
 * test, rather than a string buried in a container behind a Jotai atom and a
 * mutation.
 *
 * Renders inline content, not a block: `DeleteConfirmForm` already puts the
 * warning inside its own `<p>`.
 */
export const DeleteLessonWarning = ({
  name,
  /** How many courses currently teach this lesson — the blast radius. */
  courseCount,
}: {
  name: string;
  courseCount: number;
}) => {
  const lessonName = <span className="font-medium text-primary">{name}</span>;

  // A lesson nothing teaches has no blast radius to name, and pointing at
  // "Remove from module" instead would point at a control that is nowhere on
  // screen — the lesson sits in no module.
  if (courseCount === 0) {
    return (
      <>
        {lessonName} is not in any course yet. Deleting it erases the lesson
        itself — its video, its content and its settings — permanently, with no
        way back.
      </>
    );
  }

  if (courseCount === 1) {
    return (
      <>
        {lessonName} is taught by 1 course. Deleting it takes the lesson out of
        that course and erases every learner's progress on it — permanently,
        with no way back. To take it out of that one module but keep the lesson
        in the library, cancel and use “Remove from module” on its card instead.
      </>
    );
  }

  return (
    <>
      {lessonName} is taught by {courseCount} courses. Deleting it takes the
      lesson out of all {courseCount} and erases every learner's progress on it
      — permanently, with no way back. To take it out of one module but keep it
      in the other courses, cancel and use “Remove from module” on its card
      instead.
    </>
  );
};
