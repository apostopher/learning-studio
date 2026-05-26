import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import type { LessonMaterial } from "#/db/lesson";
import {
  useCurrentTest,
  useCurrentQuestion,
  useCurrentQuestionIndex,
  useEvaluations,
  useIsEvaluating,
  useTotalScore,
  useEvaluateAnswer,
  useAdvanceQuestion,
  useSaveResults,
  useResetTest,
  useGenerateTest,
} from "#/hooks/data/use-lesson-ai-test";
import { selectedOptionAtom, freeTextAnswerAtom } from "./question-card";
import { QuestionCard } from "./question-card";
import { EvaluationCard } from "./evaluation-card";
import { ScoreReport } from "./score-report";

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

  if (!test) return null;

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
            await generateTest(
              lessonSlug,
              material.keyPoints,
              material.text,
            );
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
    setSelectedOption("");
    setFreeTextAnswer("");
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
