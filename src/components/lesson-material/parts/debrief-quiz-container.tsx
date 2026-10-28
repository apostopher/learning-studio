import { useAtom, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import type { AITest } from '#/ai/schemas';
import { debriefSaveAtom, justSubmittedDebriefAtom } from '#/atoms/debrief';
import {
  useAdvanceQuestion,
  useCurrentQuestion,
  useCurrentQuestionIndex,
  useCurrentTest,
  useEvaluateAnswer,
  useEvaluations,
  useGenerateTest,
  useIsEvaluating,
  useIsGenerating,
  useResetTest,
  useSaveResults,
  useTotalScore,
} from '#/hooks/data/use-lesson-ai-test';
import { DebriefIntro } from './debrief-intro';
import { debriefSaveOutcome, debriefSaveState } from './debrief-save';
import { DebriefSaveNotice } from './debrief-save-notice';
import { debriefSessionForLesson } from './debrief-session-owner';
import { EvaluationCard } from './evaluation-card';
import {
  freeTextAnswerAtom,
  QuestionCard,
  selectedOptionAtom,
} from './question-card';
import { ScoreReport } from './score-report';
import { shouldAutoSaveDebrief } from './should-auto-save-debrief';

/**
 * No `material` prop. The generator's source (authored material, else the video
 * transcript) is resolved server-side from the slug, which is what lets this
 * same container render for a lesson that has no material row at all — see
 * `resolveDebriefSource`.
 */
type DebriefQuizContainerProps = {
  /** The course the debrief is being taken in — every request below names it. */
  courseSlug: string;
  lessonSlug: string;
  /** The lesson was completed at an earlier level — generate/evaluate/save must be inert. */
  readOnly: boolean;
  /** A retake after a below-par attempt — the intro says the questions are new. */
  retake: boolean;
};

export const DebriefQuizContainer = ({
  courseSlug,
  lessonSlug,
  readOnly,
  retake,
}: DebriefQuizContainerProps) => {
  const sessionTest = useCurrentTest();
  const currentQuestion = useCurrentQuestion();
  const questionIndex = useCurrentQuestionIndex();
  const evaluations = useEvaluations();
  const isEvaluating = useIsEvaluating();
  const totalScore = useTotalScore();
  const evaluateAnswer = useEvaluateAnswer();
  const advanceQuestion = useAdvanceQuestion();
  const saveResults = useSaveResults();
  const resetTest = useResetTest();
  const generateTest = useGenerateTest();
  const isGenerating = useIsGenerating();
  const setSelectedOption = useSetAtom(selectedOptionAtom);
  const setFreeTextAnswer = useSetAtom(freeTextAnswerAtom);
  const [saveRecord, setSaveRecord] = useAtom(debriefSaveAtom);
  const setJustSubmitted = useSetAtom(justSubmittedDebriefAtom);

  // A debrief session belongs to the lesson it was generated for — see
  // debriefSessionForLesson for why that needs saying at all.
  const test = debriefSessionForLesson(sessionTest, lessonSlug);
  const isForeignSession = sessionTest !== null && test === null;

  // Clear it rather than merely ignoring it, so the next lesson does not
  // inherit the same stale session — and so `useSaveResults`, which reads the
  // atom directly, can never post another lesson's answers under this slug.
  useEffect(() => {
    if (!isForeignSession) return;
    resetTest();
    setSelectedOption('');
    setFreeTextAnswer('');
  }, [isForeignSession, resetTest, setSelectedOption, setFreeTextAnswer]);

  const isComplete =
    test !== null && evaluations.length === test.questions.length;
  const currentEvaluation = currentQuestion
    ? evaluations.find((e) => e.questionId === currentQuestion.id)
    : null;

  const saveState = debriefSaveState(saveRecord, test);

  // One save of this session, from the auto-save below or the pilot's retry.
  // Each outcome is debriefSaveOutcome's: recorded, refused as not open (the
  // session is stale — drop it so the panel follows the refetched status),
  // or failed (keep the session and say so, with the same save on offer).
  const submit = useCallback(
    (session: AITest) => {
      setSaveRecord({ test: session, state: 'saving' });
      void Promise.allSettled([saveResults(courseSlug)]).then(([settled]) => {
        switch (debriefSaveOutcome(settled)) {
          case 'saved':
            setSaveRecord({ test: session, state: 'saved' });
            setJustSubmitted(lessonSlug);
            return;
          case 'not-open':
            setSaveRecord(null);
            resetTest();
            setSelectedOption('');
            setFreeTextAnswer('');
            return;
          case 'failed':
            if (settled.status === 'rejected') console.error(settled.reason);
            setSaveRecord({ test: session, state: 'failed' });
            return;
        }
      });
    },
    [
      courseSlug,
      lessonSlug,
      saveResults,
      setSaveRecord,
      setJustSubmitted,
      resetTest,
      setSelectedOption,
      setFreeTextAnswer,
    ],
  );

  // The dangerous one: this fires from a rendered state the moment the last
  // evaluation lands, not a button press, so hiding the score report would
  // not stop it writing. See shouldAutoSaveDebrief's doc comment.
  useEffect(() => {
    if (
      test === null ||
      !shouldAutoSaveDebrief({
        isComplete,
        alreadySaved: saveState !== 'unsaved',
        readOnly,
      })
    ) {
      return;
    }
    submit(test);
  }, [isComplete, test, saveState, readOnly, submit]);

  // Not `return null`: this tab is now the primary way into the debrief — the
  // only way, on a lesson with no video — so an empty panel here would be a
  // tab that appears to do nothing.
  if (!test) {
    return (
      <DebriefIntro
        loading={isGenerating}
        onStart={() => {
          if (readOnly) return;
          void generateTest({ courseSlug, lessonSlug });
        }}
        readOnly={readOnly}
        retake={retake}
      />
    );
  }

  if (isComplete) {
    return (
      <ScoreReport
        score={totalScore}
        questions={test.questions}
        evaluations={evaluations}
        footer={
          saveState === 'saving' || saveState === 'failed' ? (
            <DebriefSaveNotice
              state={saveState}
              onRetry={() => {
                if (!readOnly) submit(test);
              }}
            />
          ) : null
        }
      />
    );
  }

  if (!currentQuestion) return null;

  const handleSubmit = async (answer: string) => {
    if (readOnly) return;
    await evaluateAnswer({ courseSlug, lessonSlug }, currentQuestion, answer);
  };

  const handleNext = () => {
    setSelectedOption('');
    setFreeTextAnswer('');
    advanceQuestion((prev) => prev + 1);
  };

  if (currentEvaluation) {
    return (
      <EvaluationCard
        question={currentQuestion}
        evaluation={currentEvaluation}
        index={questionIndex}
        total={test.questions.length}
        isLast={questionIndex === test.questions.length - 1}
        onNext={handleNext}
      />
    );
  }

  return (
    <QuestionCard
      question={currentQuestion}
      index={questionIndex}
      total={test.questions.length}
      isEvaluating={isEvaluating}
      onSubmit={handleSubmit}
      readOnly={readOnly}
    />
  );
};
