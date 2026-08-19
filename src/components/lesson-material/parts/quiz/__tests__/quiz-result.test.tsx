// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CourseLessonQuizAnswers } from '#/types';
import { QuizResult } from '../quiz-result';

const answers: CourseLessonQuizAnswers = [
  {
    id: 'q1',
    question: '<p>What is V1?</p>',
    options: [
      { id: 'a', value: '<p>Decision speed</p>' },
      { id: 'b', value: '<p>Rotation speed</p>' },
    ],
    correctOptionId: 'a',
    userOptionId: 'a',
  },
  {
    id: 'q2',
    question: '<p>What is Vr?</p>',
    options: [
      { id: 'a', value: '<p>Decision speed</p>' },
      { id: 'b', value: '<p>Rotation speed</p>' },
    ],
    correctOptionId: 'b',
    userOptionId: 'a',
  },
];

const props = {
  answers,
  saveState: 'saved' as const,
  onRetrySave: () => {},
  onRetake: () => {},
  reducedMotion: true,
  readOnly: false,
};

describe('QuizResult', () => {
  it('scores against the snapshot it was given', () => {
    render(<QuizResult {...props} />);
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText('Keep practicing!')).toBeTruthy();
  });

  it('reviews every question, not just the ones answered wrong', () => {
    render(<QuizResult {...props} />);
    expect(screen.getByText('What is V1?')).toBeTruthy();
    expect(screen.getByText('What is Vr?')).toBeTruthy();
  });

  it('leaves review options as static content', () => {
    // Only Retake is actionable here. Rendering a dozen disabled option buttons
    // makes a screen reader announce a dozen unavailable controls.
    render(<QuizResult {...props} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('says nothing about saving when the attempt is recorded', () => {
    render(<QuizResult {...props} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tells the student when the save failed, and keeps the score visible', () => {
    render(<QuizResult {...props} saveState="error" />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Couldn’t save your result');
    // The failure must not take the result away with it.
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('routes the retry back to the caller', async () => {
    const onRetrySave = vi.fn();
    render(
      <QuizResult {...props} saveState="error" onRetrySave={onRetrySave} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetrySave).toHaveBeenCalledOnce();
  });

  it('routes the retake back to the caller', async () => {
    const onRetake = vi.fn();
    render(<QuizResult {...props} onRetake={onRetake} />);

    await userEvent.click(screen.getByRole('button', { name: /Retake quiz/ }));
    expect(onRetake).toHaveBeenCalledOnce();
  });
});

describe('QuizResult — read-only', () => {
  it('disables Retake and never fires it, even if clicked', async () => {
    const onRetake = vi.fn();
    render(<QuizResult {...props} onRetake={onRetake} readOnly={true} />);

    const button = screen.getByRole('button', { name: /Retake quiz/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(button);
    expect(onRetake).not.toHaveBeenCalled();
  });

  it('states the reason where assistive tech reaches it, not just visually', () => {
    render(<QuizResult {...props} readOnly={true} />);

    const button = screen.getByRole('button', { name: /Retake quiz/ });
    const describedById = button.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();

    const reason = document.getElementById(describedById as string);
    expect(reason).not.toBeNull();
    expect(reason?.textContent).toContain(
      'you completed this lesson at an earlier level',
    );
    // Visible, not sr-only — findable without a screen reader too.
    expect(reason?.className).not.toContain('sr-only');
  });

  it('carries no reason (and no aria-describedby) when not read-only', () => {
    render(<QuizResult {...props} readOnly={false} />);
    const button = screen.getByRole('button', { name: /Retake quiz/ });
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
