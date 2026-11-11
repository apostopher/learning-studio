import type { AIEvaluationResult, AITest } from '#/ai/schemas';
import { debriefSetsProgress } from '#/lib/debrief-sets';

/**
 * What one finished debrief attempt records: the questions the pilot was
 * actually asked (one set, or both — see `debriefSetsProgress`), their
 * evaluations, and the attempt's score. A second set that was never shown
 * stays out of the attempt history.
 */
export function attemptToSave(
  test: AITest,
  evaluations: readonly AIEvaluationResult[],
): { test: AITest; evaluations: AIEvaluationResult[]; totalScore: number } {
  const { asked, score } = debriefSetsProgress(
    evaluations.map((e) => e.score),
    test.questions.length,
  );
  return {
    test: { ...test, questions: test.questions.slice(0, asked) },
    evaluations: evaluations.slice(0, asked),
    totalScore: score,
  };
}
