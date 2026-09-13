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
import type { LessonRef } from '#/lib/lesson-ref';

/**
 * The three debrief requests, factored out of the hooks below and exported so
 * a test can exercise the exact fetch each hook makes (the hooks themselves
 * use `useCallback`/`useAtomCallback`, which this repo's Vitest setup cannot
 * render — see `fetchLessonPlayback` for the same split).
 *
 * Every one carries `courseSlug`: the routes refuse a body without it and
 * gate the lesson inside that course — and the debrief's transcript fallback
 * reads the video through that course's credentials.
 */
async function postDebriefJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function postGenerateTest({
  courseSlug,
  lessonSlug,
}: LessonRef): Promise<AITest> {
  const response = await postDebriefJson('/api/lesson/ai-test/generate', {
    courseSlug,
    lessonSlug,
  });
  if (!response.ok) throw new Error('Failed to generate test');
  return (await response.json()) as AITest;
}

export async function postEvaluateAnswer(
  { courseSlug, lessonSlug }: LessonRef,
  question: AITestQuestion,
  userAnswer: string,
): Promise<AIEvaluationResult> {
  const response = await postDebriefJson('/api/lesson/ai-test/evaluate', {
    courseSlug,
    lessonSlug,
    question,
    userAnswer,
  });
  if (!response.ok) throw new Error('Failed to evaluate answer');
  return (await response.json()) as AIEvaluationResult;
}

export async function postSaveResults({
  courseSlug,
  test,
  evaluations,
  totalScore,
}: {
  courseSlug: string;
  test: AITest;
  evaluations: AIEvaluationResult[];
  totalScore: number;
}): Promise<unknown> {
  const response = await postDebriefJson('/api/lesson/ai-test/save-results', {
    courseSlug,
    lessonSlug: test.lessonSlug,
    test,
    evaluations,
    totalScore,
  });
  if (!response.ok) throw new Error('Failed to save results');
  return response.json();
}

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

  // The slugs only: the server resolves what the questions are generated
  // from — authored material, else the video transcript. Callers used to pass
  // key points and body text, which no caller on a material-less lesson has.
  return useCallback(
    async (lesson: LessonRef) => {
      setIsGenerating(true);
      setIndex(0);
      setEvaluations([]);
      try {
        const test = await postGenerateTest(lesson);
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
    async (lesson: LessonRef, question: AITestQuestion, userAnswer: string) => {
      if (question.type === 'mcq') {
        const result = evaluateMCQLocal(question, userAnswer);
        setEvaluations((prev) => [...prev, result]);
        return result;
      }

      setIsEvaluating(true);
      try {
        // The grader's reference material is resolved server-side from the
        // slugs, for the same reason generation is.
        const result = await postEvaluateAnswer(lesson, question, userAnswer);
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
//
// `courseSlug` comes from the caller rather than the session atoms: the test
// carries its own `lessonSlug` (see debrief-session-owner.ts), but the course
// it is being taken in is the container's, from the route.
export function useSaveResults() {
  return useAtomCallback(
    useCallback(async (get, set, courseSlug: string) => {
      const test = get(currentTestAtom);
      const evaluations = get(evaluationsAtom);
      const totalScore = get(totalScoreAtom);

      if (!test) throw new Error('No test to save');

      const json = await postSaveResults({
        courseSlug,
        test,
        evaluations,
        totalScore,
      });
      const promotion = extractPromotion(json);
      if (promotion) set(pendingPromotionAtom, promotion);
      return json;
    }, []),
  );
}
