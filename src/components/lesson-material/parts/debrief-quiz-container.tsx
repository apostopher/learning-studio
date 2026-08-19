import { useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
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
  lessonSlug: string;
  /** The lesson was completed at an earlier level — generate/evaluate/save must be inert. */
  readOnly: boolean;
};

export const DebriefQuizContainer = ({
  lessonSlug,
  readOnly,
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
  const savedRef = useRef(false);

  // A debrief session belongs to the lesson it was generated for — see
  // debriefSessionForLesson for why that needs saying at all.
  const test = debriefSessionForLesson(sessionTest, lessonSlug);
  const isForeignSession = sessionTest !== null && test === null;

  // Clear it rather than merely ignoring it, so the next lesson does not
  // inherit the same stale session — and so `useSaveResults`, which reads the
  // atom directly, can never post another lesson's answers under this slug.
  useEffect(() => {
    if (!isForeignSession) return;
    savedRef.current = false;
    resetTest();
    setSelectedOption('');
    setFreeTextAnswer('');
  }, [isForeignSession, resetTest, setSelectedOption, setFreeTextAnswer]);

  const isComplete =
    test !== null && evaluations.length === test.questions.length;
  const currentEvaluation = currentQuestion
    ? evaluations.find((e) => e.questionId === currentQuestion.id)
    : null;

  // The dangerous one: this fires from a rendered state the moment the last
  // evaluation lands, not a button press, so hiding the score report would
  // not stop it writing. See shouldAutoSaveDebrief's doc comment.
  useEffect(() => {
    if (
      !shouldAutoSaveDebrief({
        isComplete,
        alreadySaved: savedRef.current,
        readOnly,
      })
    ) {
      return;
    }
    savedRef.current = true;
    saveResults().catch(console.error);
  }, [isComplete, saveResults, readOnly]);

  // Not `return null`: this tab is now the primary way into the debrief — the
  // only way, on a lesson with no video — so an empty panel here would be a
  // tab that appears to do nothing.
  if (!test) {
    return (
      <DebriefIntro
        loading={isGenerating}
        onStart={() => {
          if (readOnly) return;
          void generateTest(lessonSlug);
        }}
        readOnly={readOnly}
      />
    );
  }

  if (isComplete) {
    return (
      <ScoreReport
        score={totalScore}
        questions={test.questions}
        evaluations={evaluations}
        onRetake={async () => {
          if (readOnly) return;
          savedRef.current = false;
          resetTest();
          await generateTest(lessonSlug);
        }}
        readOnly={readOnly}
      />
    );
  }

  if (!currentQuestion) return null;

  const handleSubmit = async (answer: string) => {
    if (readOnly) return;
    await evaluateAnswer(lessonSlug, currentQuestion, answer);
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
