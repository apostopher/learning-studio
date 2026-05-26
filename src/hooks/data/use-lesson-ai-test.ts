import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import type { AITest, AITestQuestion, AIEvaluationResult } from "#/ai/schemas";
import {
  activeTabAtom,
  currentTestAtom,
  currentQuestionIndexAtom,
  evaluationsAtom,
  isGeneratingAtom,
  isEvaluatingAtom,
  currentQuestionAtom,
  totalScoreAtom,
  testResultsAtomFamily,
} from "#/atoms/lesson-ai-test";

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

  return useCallback(
    async (lessonSlug: string, keyPoints: string[], text: string) => {
      setIsGenerating(true);
      setIndex(0);
      setEvaluations([]);
      try {
        const response = await fetch("/api/lesson/ai-test/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonSlug, keyPoints, text }),
        });
        if (!response.ok) throw new Error("Failed to generate test");
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

// Mutation: Evaluate a single answer (does NOT auto-advance — UI controls navigation)
export function useEvaluateAnswer() {
  const setIsEvaluating = useSetAtom(isEvaluatingAtom);
  const setEvaluations = useSetAtom(evaluationsAtom);

  return useCallback(
    async (
      question: AITestQuestion,
      userAnswer: string,
      keyPoints: string[],
      text: string,
    ) => {
      setIsEvaluating(true);
      try {
        const response = await fetch("/api/lesson/ai-test/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, userAnswer, keyPoints, text }),
        });
        if (!response.ok) throw new Error("Failed to evaluate answer");
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
export function useSaveResults() {
  return useAtomCallback(
    useCallback(async (get) => {
      const test = get(currentTestAtom);
      const evaluations = get(evaluationsAtom);
      const totalScore = get(totalScoreAtom);

      if (!test) throw new Error("No test to save");

      const response = await fetch("/api/lesson/ai-test/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonSlug: test.lessonSlug,
          test,
          evaluations,
          totalScore,
        }),
      });

      if (!response.ok) throw new Error("Failed to save results");
      return response.json();
    }, []),
  );
}
