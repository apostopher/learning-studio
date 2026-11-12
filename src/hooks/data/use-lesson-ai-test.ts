import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import {
  activeTabAtom,
  currentQuestionAtom,
  currentQuestionIndexAtom,
  currentTestAtom,
  evaluationsAtom,
  isEvaluatingAtom,
  isGeneratingAtom,
  testResultsAtomFamily,
} from '#/atoms/lesson-ai-test';

// The debrief's requests (start, answer, draft) live in
// `#/data-hooks/use-debrief-attempt`. What is left here is read-only atom
// access and the lesson page's tab selection.

// Read hooks — thin wrappers over atoms
export const useCurrentTest = () => useAtomValue(currentTestAtom);
export const useCurrentQuestion = () => useAtomValue(currentQuestionAtom);
export const useCurrentQuestionIndex = () =>
  useAtomValue(currentQuestionIndexAtom);
export const useEvaluations = () => useAtomValue(evaluationsAtom);
export const useIsGenerating = () => useAtomValue(isGeneratingAtom);
export const useIsEvaluating = () => useAtomValue(isEvaluatingAtom);
export const useTestResults = (lessonSlug: string) =>
  useAtomValue(testResultsAtomFamily(lessonSlug));

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
