// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setScore } from '#/lib/lesson-score';
import { DebriefFeedback, setResultCopy } from '../debrief-feedback';

// motion's useReducedMotion needs one React: the CJS shim, as in
// question-card.test.tsx.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

function setup(props: Partial<Parameters<typeof DebriefFeedback>[0]> = {}) {
  const onNext = vi.fn();
  render(
    <DebriefFeedback
      position="Set 1 · Question 2 of 4"
      question="Why brief the go-around?"
      answer="So nobody improvises"
      verdict="Mostly there"
      score={80}
      feedback="You tied the brief to shared expectations; add who calls it."
      setResult={null}
      quizTaken={true}
      prompt=""
      nextLabel="Next question"
      onNext={onNext}
      headingLevel={2}
      idBase=":f:"
      {...props}
    />,
  );
  return { onNext };
}

describe('DebriefFeedback', () => {
  it("names itself by its heading and shows the position, verdict, score and Viper's words", () => {
    setup();
    const region = screen.getByRole('region', { name: 'Viper’s feedback' });
    expect(region.textContent).toContain('Set 1 · Question 2 of 4');
    expect(screen.getByText('Mostly there · 80')).toBeDefined();
    expect(
      screen.getByText(
        'You tied the brief to shared expectations; add who calls it.',
      ),
    ).toBeDefined();
  });

  it('keeps the question and the answer given, to read the feedback against', () => {
    setup();
    expect(screen.getByText('Why brief the go-around?')).toBeDefined();
    expect(screen.getByText('So nobody improvises')).toBeDefined();
    // Shown without a press, not folded away.
    expect(document.querySelector('details')?.open).toBe(true);
  });

  it('moves on only when the pilot presses its one button, labelled as given', async () => {
    const { onNext } = setup({ nextLabel: 'Start set 2' });
    expect(onNext).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Start set 2' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('shows the prompt that introduces set 2 when given one', () => {
    setup({ prompt: "Let's try some of the other teaching points" });
    expect(
      screen.getByText("Let's try some of the other teaching points"),
    ).toBeDefined();
  });

  it('hands the heading to the ref it is given, focusable so the feedback is read first', () => {
    let heading: HTMLHeadingElement | null = null;
    setup({
      headingRef: (el) => {
        heading = el;
      },
    });
    expect(heading).not.toBeNull();
    expect((heading as unknown as HTMLElement).tabIndex).toBe(-1);
    expect((heading as unknown as HTMLElement).tagName).toBe('H2');
  });

  it('shows the set result only when the answer completed a set', () => {
    setup();
    expect(screen.queryByText(/average/)).toBeNull();
  });

  it('shows the set result and how the lesson total adds up when the answer completed a set', () => {
    setup({
      setResult: {
        set: 1,
        average: 68,
        passed: false,
        score: setScore({ quiz: { correct: 0, total: 5 } }, 85, 68),
      },
      quizTaken: false,
    });
    expect(
      screen.getByText('Set 1 average: 68. That is short of the pass mark.'),
    ).toBeDefined();
    expect(
      screen.getByText('Quiz 0 + Debrief 68 = 68 · pass mark 85'),
    ).toBeDefined();
    expect(
      screen.getByText('Quiz not taken yet — taking it adds up to 25 points.'),
    ).toBeDefined();
  });
});

describe('setResultCopy', () => {
  it('says a passing set passes the debrief, and a missed one that it is short of the pass mark', () => {
    expect(setResultCopy({ set: 2, average: 81, passed: true })).toBe(
      'Set 2 average: 81. That passes the debrief.',
    );
    expect(setResultCopy({ set: 1, average: 68, passed: false })).toBe(
      'Set 1 average: 68. That is short of the pass mark.',
    );
  });
});
