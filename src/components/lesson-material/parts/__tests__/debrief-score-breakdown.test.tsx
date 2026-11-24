// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setScore } from '#/lib/lesson-score';
import {
  DebriefScoreBreakdown,
  scoreBreakdownLine,
} from '../debrief-score-breakdown';

describe('DebriefScoreBreakdown', () => {
  it('sums each part to the total against the pass mark', () => {
    const { container } = render(
      <DebriefScoreBreakdown
        score={setScore({ quiz: { correct: 4, total: 5 } }, 85, 51.5)}
        quizTaken={true}
      />,
    );
    expect(container.textContent).toBe(
      'Quiz 20 + Debrief 51.5 = 71.5 · pass mark 85',
    );
  });

  it('says a quiz never taken is worth taking, with its weight', () => {
    const { container } = render(
      <DebriefScoreBreakdown
        score={setScore({ quiz: { correct: 0, total: 5 } }, 85, 60)}
        quizTaken={false}
      />,
    );
    expect(container.textContent).toContain(
      'Quiz 0 + Debrief 60 = 60 · pass mark 85',
    );
    expect(container.textContent).toContain(
      'Quiz not taken yet — taking it adds up to 25 points.',
    );
  });

  it('says nothing about a quiz taken and scored 0', () => {
    const { container } = render(
      <DebriefScoreBreakdown
        score={setScore({ quiz: { correct: 0, total: 5 } }, 85, 60)}
        quizTaken={true}
      />,
    );
    expect(container.textContent).not.toContain('Quiz not taken yet');
  });

  it('a failing total never rounds up to the pass mark: 59.96 against 60 shows 59.9', () => {
    const score = setScore({ quiz: null }, 85, 59.96);
    expect(score.total).toBeCloseTo(59.96);
    expect(score.passed).toBe(false);
    const { container } = render(
      <DebriefScoreBreakdown score={score} quizTaken={true} />,
    );
    expect(container.textContent).toContain('= 59.9 · pass mark 60');
  });

  it('a lesson with no quiz names only the parts it has', () => {
    expect(scoreBreakdownLine(setScore({ quiz: null }, 85, 70))).toBe(
      'Debrief 70 = 70 · pass mark 60',
    );
  });
});
