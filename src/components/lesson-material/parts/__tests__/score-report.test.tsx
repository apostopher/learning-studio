// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

const props = {
  score: 80,
  questions,
  evaluations,
  onRetake: () => {},
  readOnly: false,
};

describe('ScoreReport', () => {
  it('fires onRetake when pressed normally', async () => {
    const onRetake = vi.fn();
    render(<ScoreReport {...props} onRetake={onRetake} />);

    await userEvent.click(screen.getByRole('button', { name: /Retake Quiz/ }));
    expect(onRetake).toHaveBeenCalledOnce();
  });

  it('is enabled and carries no reason when not read-only', () => {
    render(<ScoreReport {...props} />);
    const button = screen.getByRole('button', { name: /Retake Quiz/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  describe('read-only', () => {
    it('disables Retake and never fires it, even if clicked', async () => {
      const onRetake = vi.fn();
      render(<ScoreReport {...props} onRetake={onRetake} readOnly={true} />);

      const button = screen.getByRole('button', { name: /Retake Quiz/ });
      expect((button as HTMLButtonElement).disabled).toBe(true);

      await userEvent.click(button);
      expect(onRetake).not.toHaveBeenCalled();
    });

    it('states the reason where assistive tech reaches it, not just visually', () => {
      render(<ScoreReport {...props} readOnly={true} />);

      const button = screen.getByRole('button', { name: /Retake Quiz/ });
      const describedById = button.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();

      const reason = document.getElementById(describedById as string);
      expect(reason).not.toBeNull();
      expect(reason?.textContent).toContain(
        'you completed this lesson at an earlier level',
      );
      expect(reason?.className).not.toContain('sr-only');
    });
  });
});
