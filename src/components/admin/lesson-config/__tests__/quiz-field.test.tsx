// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CourseLessonQuiz } from '#/types';
import { QuizField } from '../quiz-field';

const quiz: CourseLessonQuiz = [
  {
    id: 'q1',
    question: 'What creates lift?',
    options: [
      { id: 'a', value: 'Airfoil' },
      { id: 'b', value: 'Gravity' },
    ],
    correctOptionId: 'a',
  },
];

describe('QuizField', () => {
  it('renders the question and its options', () => {
    render(<QuizField value={quiz} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('What creates lift?')).toBeTruthy();
    expect(screen.getByDisplayValue('Airfoil')).toBeTruthy();
    expect(screen.getByDisplayValue('Gravity')).toBeTruthy();
  });

  it('marks the correct option as checked', () => {
    render(<QuizField value={quiz} onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
  });

  it("adds a question when 'Add question' is clicked", async () => {
    const onChange = vi.fn();
    render(<QuizField value={quiz} onChange={onChange} />);
    await userEvent.click(
      screen.getByRole('button', { name: /add question/i }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CourseLessonQuiz;
    expect(next).toHaveLength(2);
  });

  it('repairs correctOptionId when the correct option is removed', async () => {
    const onChange = vi.fn();
    render(<QuizField value={quiz} onChange={onChange} />);
    const removeButtons = screen.getAllByRole('button', {
      name: /remove option/i,
    });
    await userEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CourseLessonQuiz;
    expect(next[0].options).toEqual([{ id: 'b', value: 'Gravity' }]);
    expect(next[0].correctOptionId).toBe('b');
  });
});
