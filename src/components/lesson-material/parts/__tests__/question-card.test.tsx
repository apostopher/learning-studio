// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AITestQuestion } from '#/ai/schemas';
import { READ_ONLY_CONTROL_REASON } from '#/lib/read-only-lesson-copy';
import { QuestionCard } from '../question-card';

const mcq: AITestQuestion = {
  id: 'q1',
  type: 'mcq',
  question: 'What is V1?',
  options: [
    { id: 'a', value: 'Decision speed' },
    { id: 'b', value: 'Rotation speed' },
  ],
  correctOptionId: 'a',
  keyPointIndex: 0,
};

const freeText: AITestQuestion = {
  id: 'q2',
  type: 'free-text',
  question: 'Why does it matter?',
  expectedAnswer: 'Because.',
  keyPointIndex: 0,
};

/**
 * The debrief's Submit used to be gated on `!selected || isEvaluating` alone,
 * while `handleSubmit` returned silently in read-only. A pilot could answer
 * every question, press Submit, and get nothing at all — not even an error,
 * because the save state never left 'idle'.
 */
describe('QuestionCard read-only', () => {
  it('refuses to submit an MCQ answer, and says why', async () => {
    const onSubmit = vi.fn();
    render(
      <QuestionCard
        question={mcq}
        index={0}
        total={2}
        isEvaluating={false}
        onSubmit={onSubmit}
        readOnly
      />,
    );

    const option = screen.getByRole('radio', { name: /Decision speed/ });
    expect((option as HTMLInputElement).disabled).toBe(true);

    const submit = screen.getByRole('button', { name: /Submit/ });
    // aria-disabled, not native disabled: the control must stay focusable so
    // its aria-describedby reason is actually announced — the same choice
    // DebriefIntro's Start makes.
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(submit.getAttribute('aria-describedby')).toBe(
      screen.getByText(READ_ONLY_CONTROL_REASON).getAttribute('id'),
    );

    await userEvent.click(submit, { pointerEventsCheck: 0 });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses to submit a free-text answer', async () => {
    const onSubmit = vi.fn();
    render(
      <QuestionCard
        question={freeText}
        index={1}
        total={2}
        isEvaluating={false}
        onSubmit={onSubmit}
        readOnly
      />,
    );

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(
      true,
    );

    await userEvent.click(screen.getByRole('button', { name: /Submit/ }), {
      pointerEventsCheck: 0,
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits normally when not read-only', async () => {
    const onSubmit = vi.fn();
    render(
      <QuestionCard
        question={mcq}
        index={0}
        total={2}
        isEvaluating={false}
        onSubmit={onSubmit}
        readOnly={false}
      />,
    );

    await userEvent.click(
      screen.getByRole('radio', { name: /Decision speed/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Submit/ }));

    expect(onSubmit).toHaveBeenCalledWith('a');
    expect(screen.queryByText(READ_ONLY_CONTROL_REASON)).toBeNull();
  });
});
