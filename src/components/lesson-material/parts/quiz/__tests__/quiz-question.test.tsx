// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { READ_ONLY_CONTROL_REASON } from '#/lib/read-only-lesson-copy';
import type { CourseLessonQuizQuestion } from '#/types';
import { QuizQuestion } from '../quiz-question';

const question: CourseLessonQuizQuestion = {
  id: 'q1',
  question: '<p>What is V1?</p>',
  options: [
    { id: 'a', value: '<p>Decision speed</p>' },
    { id: 'b', value: '<p>Rotation speed</p>' },
  ],
  correctOptionId: 'a',
};

const props = {
  question,
  index: 0,
  total: 3,
  chosenOptionId: undefined as string | undefined,
  revealed: false,
  onSelect: () => {},
  onNext: () => {},
  reducedMotion: true,
  readOnly: false,
};

describe('QuizQuestion', () => {
  it('hands the chosen option id to onSelect', async () => {
    const onSelect = vi.fn();
    render(<QuizQuestion {...props} onSelect={onSelect} />);

    await userEvent.click(
      screen.getByRole('button', { name: /Rotation speed/ }),
    );

    // The id, not the label or the index — this is what ends up in the
    // persisted snapshot.
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('offers each option as a real button before the reveal', () => {
    render(<QuizQuestion {...props} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('stops offering options as buttons once answered', () => {
    // The first tap commits. Leaving them focusable would let a keyboard user
    // tab to a control that silently does nothing.
    render(<QuizQuestion {...props} chosenOptionId="b" revealed />);
    const buttons = screen.getAllByRole('button');
    expect(
      buttons.every((button) => /Next question/.test(button.textContent ?? '')),
    ).toBe(true);
  });

  it('holds a wrong answer behind an explicit Next', async () => {
    const onNext = vi.fn();
    render(
      <QuizQuestion {...props} chosenOptionId="b" revealed onNext={onNext} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /Next question/ }),
    );
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('offers no Next after a correct answer, which advances itself', () => {
    render(<QuizQuestion {...props} chosenOptionId="a" revealed />);
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
  });

  it('names the last step for what it is', () => {
    render(<QuizQuestion {...props} index={2} chosenOptionId="b" revealed />);
    expect(screen.getByRole('button', { name: /See results/ })).toBeTruthy();
  });

  it('renders authored HTML as markup, not as literal tags', () => {
    // Quiz prose is HTML despite the schema calling it markdown — a plain text
    // node here would show "<p>What is V1?</p>" to the student.
    render(<QuizQuestion {...props} />);
    expect(screen.queryByText('<p>What is V1?</p>')).toBeNull();
    expect(screen.getByText('What is V1?')).toBeTruthy();
  });

  /**
   * The archive case, and the common one: completion here is video-only, so a
   * pilot re-opening an out-of-tier lesson usually has NO saved attempt and
   * lands on question one. Before this, they could answer every question,
   * reach the result slide, and have `runSubmit` refuse in silence —
   * `saveState` resolves to 'idle', not 'error', so nothing was said at all.
   */
  it('offers no answerable option in read-only, and says why', () => {
    const onSelect = vi.fn();
    render(<QuizQuestion {...props} readOnly onSelect={onSelect} />);

    // Static rows, not disabled buttons — a screen reader reads them as prose
    // rather than announcing a list of unavailable controls.
    expect(screen.queryByRole('button', { name: /Rotation speed/ })).toBeNull();
    expect(screen.getByText(READ_ONLY_CONTROL_REASON)).toBeDefined();
  });

  it('refuses to advance from a read-only slide even when the control is clicked', async () => {
    const onNext = vi.fn();
    render(
      <QuizQuestion
        {...props}
        readOnly
        chosenOptionId="b"
        revealed
        onNext={onNext}
      />,
    );

    const next = screen.getByRole('button', { name: /Next question/ });
    expect(next.getAttribute('aria-disabled')).toBe('true');
    // aria-disabled does not block the event, so the handler itself must.
    await userEvent.click(next, { pointerEventsCheck: 0 });
    expect(onNext).not.toHaveBeenCalled();
  });
});
