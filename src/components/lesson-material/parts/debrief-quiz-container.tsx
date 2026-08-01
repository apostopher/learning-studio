import { useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import type { LessonMaterial } from '#/db/lesson';
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
import { EvaluationCard } from './evaluation-card';
import {
  freeTextAnswerAtom,
  QuestionCard,
  selectedOptionAtom,
} from './question-card';
import { ScoreReport } from './score-report';

type DebriefQuizContainerProps = {
  lessonSlug: string;
  material: NonNullable<LessonMaterial>;
};

export const DebriefQuizContainer = ({
  lessonSlug,
  material,
}: DebriefQuizContainerProps) => {
  const test = useCurrentTest();
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

  const isComplete =
    test !== null && evaluations.length === test.questions.length;
  const currentEvaluation = currentQuestion
    ? evaluations.find((e) => e.questionId === currentQuestion.id)
    : null;

  useEffect(() => {
    if (isComplete && !savedRef.current) {
      savedRef.current = true;
      saveResults().catch(console.error);
    }
  }, [isComplete, saveResults]);

  // Not `return null`: this tab is now the primary way into the debrief — the
  // only way, on a lesson with no video — so an empty panel here would be a
  // tab that appears to do nothing.
  if (!test) {
    return (
      <DebriefIntro
        loading={isGenerating}
        onStart={() => {
          if (!material.keyPoints?.length || !material.text) return;
          void generateTest(lessonSlug, material.keyPoints, material.text);
        }}
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
          savedRef.current = false;
          resetTest();
          if (material.keyPoints?.length && material.text) {
            await generateTest(lessonSlug, material.keyPoints, material.text);
          }
        }}
      />
    );
  }

  if (!currentQuestion) return null;

  const handleSubmit = async (answer: string) => {
    if (!material.keyPoints || !material.text) return;
    await evaluateAnswer(
      currentQuestion,
      answer,
      material.keyPoints,
      material.text,
    );
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
    />
  );
};
