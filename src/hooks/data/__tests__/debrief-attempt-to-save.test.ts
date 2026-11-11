import { describe, expect, it } from 'vitest';
import type { AIEvaluationResult, AITest } from '#/ai/schemas';
import { attemptToSave } from '#/hooks/data/debrief-attempt-to-save';

const q = (id: string) => ({
  id,
  type: 'free-text' as const,
  question: `${id}?`,
  expectedAnswer: 'a',
  keyPointIndex: 0,
});
const test: AITest = {
  lessonSlug: 'l1',
  questions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map(q),
};
const ev = (questionId: string, score: number): AIEvaluationResult => ({
  questionId,
  type: 'free-text',
  score,
  userAnswer: 'x',
  explanation: 'e',
});

describe('attemptToSave', () => {
  it('saves only the questions the pilot was asked, and their average', () => {
    // Passed on the first set: the second set was never shown, so it must
    // not reach the attempt history as unanswered questions.
    const saved = attemptToSave(test, [
      ev('q1', 100),
      ev('q2', 80),
      ev('q3', 60),
    ]);
    expect(saved.test.questions.map((x) => x.id)).toEqual(['q1', 'q2', 'q3']);
    expect(saved.evaluations).toHaveLength(3);
    expect(saved.totalScore).toBe(80);
  });

  it('saves all six, averaged together, when the second set was asked', () => {
    const scores = [50, 50, 50, 100, 100, 100];
    const saved = attemptToSave(
      test,
      scores.map((s, i) => ev(`q${i + 1}`, s)),
    );
    expect(saved.test.questions).toHaveLength(6);
    expect(saved.totalScore).toBe(75);
  });
});
