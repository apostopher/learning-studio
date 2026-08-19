import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useAtomCallback } from 'jotai/utils';
import { useCallback } from 'react';
import type { AIEvaluationResult, AITest, AITestQuestion } from '#/ai/schemas';
import {
  activeTabAtom,
  currentQuestionAtom,
  currentQuestionIndexAtom,
  currentTestAtom,
  evaluationsAtom,
  isEvaluatingAtom,
  isGeneratingAtom,
  testResultsAtomFamily,
  totalScoreAtom,
} from '#/atoms/lesson-ai-test';
import { extractPromotion, pendingPromotionAtom } from '#/atoms/promotion';

// Read hooks — thin wrappers over atoms
export const useCurrentTest = () => useAtomValue(currentTestAtom);
export const useCurrentQuestion = () => useAtomValue(currentQuestionAtom);
export const useCurrentQuestionIndex = () =>
  useAtomValue(currentQuestionIndexAtom);
export const useEvaluations = () => useAtomValue(evaluationsAtom);
export const useIsGenerating = () => useAtomValue(isGeneratingAtom);
export const useIsEvaluating = () => useAtomValue(isEvaluatingAtom);
export const useTotalScore = () => useAtomValue(totalScoreAtom);
export const useTestResults = (lessonSlug: string) =>
  useAtomValue(testResultsAtomFamily(lessonSlug));

// Mutation: Generate a new test
export function useGenerateTest() {
  const setTest = useSetAtom(currentTestAtom);
  const setIsGenerating = useSetAtom(isGeneratingAtom);
  const setIndex = useSetAtom(currentQuestionIndexAtom);
  const setEvaluations = useSetAtom(evaluationsAtom);

  // `lessonSlug` only: the server resolves what the questions are generated
  // from — authored material, else the video transcript. Callers used to pass
  // key points and body text, which no caller on a material-less lesson has.
  return useCallback(
    async (lessonSlug: string) => {
      setIsGenerating(true);
      setIndex(0);
      setEvaluations([]);
      try {
        const response = await fetch('/api/lesson/ai-test/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonSlug }),
        });
        if (!response.ok) throw new Error('Failed to generate test');
        const test = (await response.json()) as AITest;
        setTest(test);
        return test;
      } finally {
        setIsGenerating(false);
      }
    },
    [setTest, setIsGenerating, setIndex, setEvaluations],
  );
}

export const useActiveTab = () => useAtom(activeTabAtom);
export const useAdvanceQuestion = () => useSetAtom(currentQuestionIndexAtom);

export function useResetTest() {
  const setTest = useSetAtom(currentTestAtom);
  const setIndex = useSetAtom(currentQuestionIndexAtom);
  const setEvaluations = useSetAtom(evaluationsAtom);

  return useCallback(() => {
    setTest(null);
    setIndex(0);
    setEvaluations([]);
  }, [setTest, setIndex, setEvaluations]);
}

function evaluateMCQLocal(
  question: Extract<AITestQuestion, { type: 'mcq' }>,
  userAnswer: string,
): AIEvaluationResult {
  const correctOption = question.options.find(
    (o) => o.id === question.correctOptionId,
  );
  return {
    questionId: question.id,
    type: 'mcq',
    score: userAnswer === question.correctOptionId ? 100 : 0,
    userAnswer,
    explanation: `The correct answer is: ${correctOption?.value ?? question.correctOptionId}`,
  };
}

// Mutation: Evaluate a single answer (does NOT auto-advance — UI controls navigation)
// MCQ is evaluated client-side (deterministic). Free-text calls the server for AI grading.
export function useEvaluateAnswer() {
  const setIsEvaluating = useSetAtom(isEvaluatingAtom);
  const setEvaluations = useSetAtom(evaluationsAtom);

  return useCallback(
    async (
      lessonSlug: string,
      question: AITestQuestion,
      userAnswer: string,
    ) => {
      if (question.type === 'mcq') {
        const result = evaluateMCQLocal(question, userAnswer);
        setEvaluations((prev) => [...prev, result]);
        return result;
      }

      setIsEvaluating(true);
      try {
        // The grader's reference material is resolved server-side from the
        // slug, for the same reason generation is.
        const response = await fetch('/api/lesson/ai-test/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonSlug, question, userAnswer }),
        });
        if (!response.ok) throw new Error('Failed to evaluate answer');
        const result = (await response.json()) as AIEvaluationResult;
        setEvaluations((prev) => [...prev, result]);
        return result;
      } finally {
        setIsEvaluating(false);
      }
    },
    [setIsEvaluating, setEvaluations],
  );
}

// Mutation: Save completed test results
//
// `/api/lesson/ai-test/save-results` returns `{ ...result, promotion }` —
// `promotion` is read out of the raw json and pushed straight into the
// pending-promotion atom via `set`, the same seam every other progress
// mutation in this file already writes through.
export function useSaveResults() {
  return useAtomCallback(
    useCallback(async (get, set) => {
      const test = get(currentTestAtom);
      const evaluations = get(evaluationsAtom);
      const totalScore = get(totalScoreAtom);

      if (!test) throw new Error('No test to save');

      const response = await fetch('/api/lesson/ai-test/save-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonSlug: test.lessonSlug,
          test,
          evaluations,
          totalScore,
        }),
      });

      if (!response.ok) throw new Error('Failed to save results');
      const json = await response.json();
      const promotion = extractPromotion(json);
      if (promotion) set(pendingPromotionAtom, promotion);
      return json;
    }, []),
  );
}
