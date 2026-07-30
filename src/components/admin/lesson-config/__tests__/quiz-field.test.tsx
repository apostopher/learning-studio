// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * RichTextEditor is mocked as a plain textarea.
 *
 * Not a shortcut: importing `@tiptap` under this repo's Vitest pipeline
 * duplicates React, so rendering any hook-using component throws "Invalid hook
 * call" — the reason `rich-text-editor.test.tsx` skips its own render test.
 * Without a mock, QuizField would become untestable the moment it embedded an
 * editor, silently dropping coverage of the correctOptionId repair below, which
 * is real branching logic and the most breakable thing in this component.
 *
 * The mock keeps the seam honest: it forwards `value` and `onChange` exactly as
 * the real editor does (HTML string in, HTML string out) and preserves
 * `ariaLabel`, so the assertions still exercise QuizField's own wiring.
 */
vi.mock('../rich-text-editor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (html: string) => void;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

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

  it('labels the question and each option for assistive tech', () => {
    // The editors replaced <label htmlFor> markup, so the accessible name now
    // comes from RichTextEditor's ariaLabel — assert it actually arrives.
    render(<QuizField value={quiz} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Question 1')).toBeTruthy();
    expect(screen.getByLabelText('Option 1')).toBeTruthy();
    expect(screen.getByLabelText('Option 2')).toBeTruthy();
  });

  it('marks the correct option as checked', () => {
    render(<QuizField value={quiz} onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
  });

  it('propagates edited question HTML to onChange', () => {
    const onChange = vi.fn();
    render(<QuizField value={quiz} onChange={onChange} />);
    // The real editor emits a whole new HTML string per change, so assert on
    // the value the parent actually received rather than on keystrokes.
    fireEvent.change(screen.getByLabelText('Question 1'), {
      target: { value: '<p>What creates <strong>lift</strong>?</p>' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CourseLessonQuiz;
    expect(next[0].question).toBe('<p>What creates <strong>lift</strong>?</p>');
    // The rest of the question must be carried through untouched.
    expect(next[0].options).toEqual(quiz[0].options);
    expect(next[0].correctOptionId).toBe('a');
  });

  it('propagates edited option HTML to the right option only', () => {
    const onChange = vi.fn();
    render(<QuizField value={quiz} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Option 2'), {
      target: { value: '<p><em>Gravity</em></p>' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CourseLessonQuiz;
    expect(next[0].options).toEqual([
      { id: 'a', value: 'Airfoil' },
      { id: 'b', value: '<p><em>Gravity</em></p>' },
    ]);
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
