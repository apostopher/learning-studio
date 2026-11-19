// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { lessonTotalScore } from '#/lib/lesson-score';
import {
  DebriefScoreBreakdown,
  scoreBreakdownLine,
} from '../debrief-score-breakdown';

describe('DebriefScoreBreakdown', () => {
  it('sums each part to the total against the pass mark', () => {
    const { container } = render(
      <DebriefScoreBreakdown
        score={lessonTotalScore({ video: 1, quiz: 0.8, debrief: 0.515 }, 85)}
        quizTaken={true}
      />,
    );
    expect(container.textContent).toBe(
      'Video 50 + Quiz 20 + Debrief 12.9 = 82.9 · pass mark 85',
    );
  });

  it('says a quiz never taken is worth taking, with its weight', () => {
    const { container } = render(
      <DebriefScoreBreakdown
        score={lessonTotalScore({ video: 1, quiz: 0, debrief: 0.6 }, 85)}
        quizTaken={false}
      />,
    );
    expect(container.textContent).toContain(
      'Video 50 + Quiz 0 + Debrief 15 = 65 · pass mark 85',
    );
    expect(container.textContent).toContain(
      'Quiz not taken yet — taking it adds up to 25 points.',
    );
  });

  it('says nothing about a quiz taken and scored 0', () => {
    const { container } = render(
      <DebriefScoreBreakdown
        score={lessonTotalScore({ video: 1, quiz: 0, debrief: 0.6 }, 85)}
        quizTaken={true}
      />,
    );
    expect(container.textContent).not.toContain('Quiz not taken yet');
  });

  it('a lesson with no quiz names only the parts it has', () => {
    expect(
      scoreBreakdownLine(
        lessonTotalScore({ video: 1, quiz: null, debrief: 0.7 }, 85),
      ),
    ).toBe('Video 50 + Debrief 35 = 85 · pass mark 85');
  });
});
