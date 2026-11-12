import { atom } from 'jotai';
import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import type { AIEvaluationResult, AITest } from '#/ai/schemas';
import type { LessonTestResultsSelect } from '#/db/schema';
import { queryKeys } from '#/hooks/data/keys';

// Writable atoms for test session state
export const currentTestAtom = atom<AITest | null>(null);
export const currentQuestionIndexAtom = atom(0);
export const evaluationsAtom = atom<AIEvaluationResult[]>([]);
export const isGeneratingAtom = atom(false);
export const isEvaluatingAtom = atom(false);

// Derived atoms (read-only)
export const currentQuestionAtom = atom((get) => {
  const test = get(currentTestAtom);
  const index = get(currentQuestionIndexAtom);
  if (!test) return null;
  return test.questions[index] ?? null;
});

/**
 * The material tab the pilot last selected, and on which lesson. Null until
 * they pick one; a selection only applies to its own lesson (see
 * `resolveActiveTab`).
 */
export const activeTabAtom = atom<{ lessonSlug: string; tab: string } | null>(
  null,
);

// Atom family for fetching past test results per lesson
export const testResultsAtomFamily = atomFamily((lessonSlug: string) =>
  atomWithQuery<LessonTestResultsSelect[]>(() => ({
    queryKey: queryKeys.aiTestResults(lessonSlug),
    queryFn: async () => {
      const response = await fetch(
        `/api/lesson/ai-test/results?lessonSlug=${encodeURIComponent(lessonSlug)}`,
      );
      if (!response.ok) {
        throw new Error('Failed to fetch test results');
      }
      return (await response.json()) as LessonTestResultsSelect[];
    },
    enabled: !!lessonSlug,
    staleTime: 1000 * 60 * 5,
  })),
);
