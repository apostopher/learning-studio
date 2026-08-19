import { useRouteContext } from '@tanstack/react-router';
import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai-family';
import { useCallback, useEffect, useRef } from 'react';
import { quizProgressAtomFamily, quizProgressKey } from '#/atoms/lesson-quiz';
import { ClientGate } from '#/components/client-gate';
import {
  useLessonQuizResult,
  useSubmitLessonQuiz,
} from '#/data-hooks/use-lesson-quiz-result';
import {
  emptyQuizProgress,
  partitionQuiz,
  revealAnnouncement,
} from '#/lib/lesson-quiz';
import type { CourseLessonQuiz } from '#/types';
import { computeLessonQuizView } from './compute-lesson-quiz-view';
import { LessonQuiz } from './lesson-quiz';
import type { QuizSaveState } from './quiz-result';
import { shouldAutoSubmitQuiz } from './should-auto-submit-quiz';

/** How long a correct answer stays on screen before advancing. */
const CORRECT_ANSWER_DWELL_MS = 1200;

/**
 * Whether the student has asked to retake. Deliberately not persisted: a
 * reload should return them to their recorded result, not to a blank quiz they
 * did not ask for. An in-progress retake survives a reload through stored
 * progress instead — see `computeLessonQuizView`.
 */
const retakingAtomFamily = atomFamily((_key: string) => atom(false));

type LessonQuizContainerProps = {
  lessonSlug: string;
  quiz: CourseLessonQuiz | null;
  /** The lesson was completed at an earlier level — submitting must be inert. */
  readOnly: boolean;
};

/**
 * The lesson's authored quiz.
 *
 * Client-gated because the progress atom reads localStorage on init
 * (`getOnInit`), which the server render cannot see — without the gate the
 * first client render disagrees with the markup it is hydrating.
 */
export const LessonQuizContainer = ({
  lessonSlug,
  quiz,
  readOnly,
}: LessonQuizContainerProps) => (
  <ClientGate>
    {() => (
      <LessonQuizClient
        lessonSlug={lessonSlug}
        quiz={quiz}
        readOnly={readOnly}
      />
    )}
  </ClientGate>
);

const LessonQuizClient = ({
  lessonSlug,
  quiz,
  readOnly,
}: LessonQuizContainerProps) => {
  const session = useRouteContext({
    from: '__root__',
    select: (context) => context.session,
  });
  const userId = session?.user?.id ?? '';

  const { askable } = partitionQuiz(quiz);
  const result = useLessonQuizResult(lessonSlug);
  const submit = useSubmitLessonQuiz(lessonSlug);

  const storageKey = quizProgressKey(userId, lessonSlug);
  const [storedProgress, setProgress] = useAtom(
    quizProgressAtomFamily(storageKey),
  );
  const [isRetaking, setIsRetaking] = useAtom(retakingAtomFamily(storageKey));

  const view = computeLessonQuizView({
    askable,
    isFetched: result.isFetched,
    saved: result.data?.answers ?? null,
    isRetaking,
    storedProgress,
  });

  /**
   * The validated view, not the raw stored value, is what every write builds
   * on.
   *
   * Held in a ref so `advance` keeps a stable identity: it is a dependency of
   * the dwell effect below, and an identity that changed each render would
   * restart the 1.2s timer on every re-render — a background refetch could
   * postpone the advance indefinitely.
   *
   * Reading `storedProgress` directly in a functional update would be the bug
   * this avoids: progress discarded by `restoreQuizProgress` (an admin edited
   * the quiz since) is still sitting in localStorage, so `previous.index + 1`
   * would advance from an index the student never saw.
   */
  const viewRef = useRef(view);
  viewRef.current = view;

  // Guarded like every other write path here: `setProgress` persists to
  // localStorage, so an ungated advance would leave a half-played archive
  // attempt behind that `runSubmit` can never save.
  const advance = useCallback(() => {
    if (readOnly) return;
    const current = viewRef.current;
    if (current.kind !== 'quiz') return;
    setProgress({
      index: current.index + 1,
      answers: current.answers,
      revealedQuestionId: null,
    });
  }, [readOnly, setProgress]);

  const handleSelect = useCallback(
    (optionId: string) => {
      if (readOnly) return;
      if (view.kind !== 'quiz' || view.revealedQuestionId) return;
      const question = askable[view.index];
      if (!question) return;

      setProgress({
        index: view.index,
        answers: { ...view.answers, [question.id]: optionId },
        revealedQuestionId: question.id,
      });
    },
    [askable, readOnly, setProgress, view],
  );

  const revealedQuestionId =
    view.kind === 'quiz' ? view.revealedQuestionId : null;
  const revealedWasCorrect =
    view.kind === 'quiz' && revealedQuestionId
      ? view.answers[revealedQuestionId] ===
        askable.find((question) => question.id === revealedQuestionId)
          ?.correctOptionId
      : false;

  /**
   * A correct answer dwells, then advances itself. A wrong one waits for the
   * student — the correct option is the only feedback this quiz carries, and
   * that is exactly the moment they need to read it.
   *
   * The timer lives in an effect so it is cleared on unmount: the quiz sits in
   * a tab panel, and a student who switches tabs inside the dwell window must
   * not have the carousel advance behind their back.
   */
  useEffect(() => {
    if (!revealedQuestionId || !revealedWasCorrect) return;
    const timer = setTimeout(advance, CORRECT_ANSWER_DWELL_MS);
    return () => clearTimeout(timer);
  }, [revealedQuestionId, revealedWasCorrect, advance]);

  /**
   * Submit a finished attempt exactly once per mount.
   *
   * Guarded because the trigger is a rendered state, not an event, and
   * insert-only writes turn a second fire into a second attempt row. The guard
   * resets on remount on purpose: an attempt whose POST failed is retried
   * automatically on the next visit, rather than sitting in localStorage
   * forever.
   */
  const submittedRef = useRef(false);
  const pendingAnswers =
    view.kind === 'quiz' && view.source === 'local' ? view.resultAnswers : null;

  // `readOnly` is checked in `runSubmit` itself, not just in the effect that
  // usually triggers it — `handleRetrySave` (a button) calls this same
  // function, and a write must be inert on every path that can reach it, not
  // merely on the one the effect happens to use.
  const runSubmit = useCallback(() => {
    if (!pendingAnswers || readOnly) return;
    submittedRef.current = true;
    submit.mutate(pendingAnswers, {
      onSuccess: () => {
        // Clear only once the server has it. Clearing when the result slide
        // renders would mean a failed POST plus a reload loses the attempt from
        // both places at once.
        setProgress(emptyQuizProgress);
        setIsRetaking(false);
      },
    });
  }, [pendingAnswers, readOnly, setIsRetaking, setProgress, submit]);

  // The dangerous one: this fires from a rendered state on mount/update, not
  // a button press, so hiding the submit UI would not stop it writing. See
  // shouldAutoSubmitQuiz's doc comment.
  useEffect(() => {
    if (
      !shouldAutoSubmitQuiz({
        pendingAnswers,
        alreadySubmitted: submittedRef.current,
        isPending: submit.isPending,
        readOnly,
      })
    ) {
      return;
    }
    runSubmit();
  }, [pendingAnswers, runSubmit, submit.isPending, readOnly]);

  // Guarded too, not just the submit path: retaking an archive quiz would
  // start an attempt that `runSubmit` can never save, which reads as a bug
  // rather than a deliberately inert view.
  const handleRetake = useCallback(() => {
    if (readOnly) return;
    submittedRef.current = false;
    submit.reset();
    setProgress(emptyQuizProgress);
    setIsRetaking(true);
  }, [readOnly, setIsRetaking, setProgress, submit]);

  const handleRetrySave = useCallback(() => {
    if (readOnly) return;
    submittedRef.current = false;
    runSubmit();
  }, [readOnly, runSubmit]);

  if (view.kind === 'empty') {
    return (
      <p className="text-sm text-secondary">
        No quiz available for this lesson yet.
      </p>
    );
  }

  if (view.kind === 'loading') {
    return (
      <output
        className="flex flex-col gap-2"
        aria-busy="true"
        aria-label="Loading quiz"
      >
        <div className="lesson-material-skeleton-line h-4 w-9/12" />
        <div className="lesson-material-skeleton-line h-11 w-full" />
        <div className="lesson-material-skeleton-line h-11 w-full" />
        <div className="lesson-material-skeleton-line h-11 w-full" />
      </output>
    );
  }

  const question = askable[view.index];
  const chosenOptionId = question ? view.answers[question.id] : undefined;
  const announcement =
    question && view.revealedQuestionId === question.id && chosenOptionId
      ? revealAnnouncement(question, chosenOptionId)
      : '';

  const saveState: QuizSaveState =
    view.source === 'saved'
      ? 'saved'
      : submit.isPending
        ? 'saving'
        : submit.isError
          ? 'error'
          : 'idle';

  return (
    <LessonQuiz
      questions={askable}
      index={view.index}
      answers={view.answers}
      revealedQuestionId={view.revealedQuestionId}
      announcement={announcement}
      resultAnswers={view.resultAnswers}
      saveState={saveState}
      onSelect={handleSelect}
      onNext={advance}
      onRetake={handleRetake}
      onRetrySave={handleRetrySave}
      readOnly={readOnly}
    />
  );
};
