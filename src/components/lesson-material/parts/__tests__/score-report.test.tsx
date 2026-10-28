// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AIEvaluationResult, AITestQuestion } from '#/ai/schemas';
import { ScoreReport } from '../score-report';

const questions: AITestQuestion[] = [
  {
    id: 'q1',
    type: 'mcq',
    question: 'What is V1?',
    options: [
      { id: 'a', value: 'Decision speed' },
      { id: 'b', value: 'Rotation speed' },
    ],
    correctOptionId: 'a',
    keyPointIndex: 0,
  },
];

const evaluations: AIEvaluationResult[] = [
  {
    questionId: 'q1',
    type: 'mcq',
    score: 80,
    userAnswer: 'a',
    explanation: 'Correct.',
  },
];

const props = { score: 80, questions, evaluations };

describe('ScoreReport', () => {
  it('has no Retake button — retakes happen only by the tab reopening (call 8)', () => {
    render(<ScoreReport {...props} />);
    expect(screen.queryByRole('button', { name: /Retake/ })).toBeNull();
  });

  it('renders the footer it is given in the summary', () => {
    render(
      <ScoreReport
        {...props}
        footer={<p>Next attempt opens Tue 28 Oct, 3:40 PM</p>}
      />,
    );
    expect(
      screen.getByText('Next attempt opens Tue 28 Oct, 3:40 PM'),
    ).toBeDefined();
  });

  it('expands a question to the answer given', async () => {
    render(<ScoreReport {...props} />);
    await userEvent.click(screen.getByRole('button', { name: /What is V1/ }));
    expect(screen.getByText('Correct.')).toBeDefined();
  });
});
