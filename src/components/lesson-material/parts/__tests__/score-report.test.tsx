// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { lessonTotalScore } from '#/lib/lesson-score';
import { ScoreReport, setSummary } from '../score-report';

// Capture what the ring was handed: the report's number IS the ring's prop.
const ringProps = vi.hoisted(() => [] as { score: number }[]);
vi.mock('../score-ring', () => ({
  ScoreRing: (props: { score: number }) => {
    ringProps.push(props);
    return null;
  },
}));

const holes = {
  score: null,
  quizTaken: true,
  result: { passed: false, score: 71, setAverages: [68, 71] },
  revisitNotes: [
    'Lift depends on airspeed squared, so halving speed quarters lift — your answer said it halves.',
    'A stall is about angle of attack, not speed; you tied it to a minimum speed.',
  ],
};

describe('ScoreReport', () => {
  it('rings the score of the set that ended it and states every set average against the pass mark', () => {
    ringProps.length = 0;
    render(<ScoreReport {...holes} headingLevel={2} idBase=":r1:" />);
    expect(ringProps.at(-1)?.score).toBe(71);
    expect(
      screen.getByRole('heading', { name: 'Not passed this time' }),
    ).toBeDefined();
    expect(
      screen.getByText('Set 1 average 68, set 2 average 71.'),
    ).toBeDefined();
  });

  it('renders each revisit note as its own paragraph, word for word', () => {
    render(<ScoreReport {...holes} headingLevel={2} idBase=":r1:" />);
    const section = screen.getByRole('region', { name: 'Worth revisiting' });
    const paragraphs = [...section.querySelectorAll('p')].map(
      (p) => p.textContent,
    );
    expect(paragraphs).toEqual(holes.revisitNotes);
    expect(section.querySelector('ul, li')).toBeNull();
  });

  it('a pass rings its passing set average and lists nothing to revisit', () => {
    ringProps.length = 0;
    render(
      <ScoreReport
        result={{ passed: true, score: 82, setAverages: [82] }}
        score={null}
        quizTaken={true}
        revisitNotes={['should not show']}
        headingLevel={2}
        idBase=":r1:"
      />,
    );
    expect(ringProps.at(-1)?.score).toBe(82);
    expect(
      screen.getByRole('heading', { name: 'Debrief passed' }),
    ).toBeDefined();
    expect(screen.getByText('Set 1 average 82.')).toBeDefined();
    expect(
      screen.queryByRole('region', { name: 'Worth revisiting' }),
    ).toBeNull();
    expect(screen.queryByText('should not show')).toBeNull();
  });

  it('has no revisit section when there are no notes', () => {
    render(
      <ScoreReport
        {...holes}
        revisitNotes={[]}
        headingLevel={2}
        idBase=":r1:"
      />,
    );
    expect(
      screen.queryByRole('region', { name: 'Worth revisiting' }),
    ).toBeNull();
  });

  it('renders the footer it is given (the decline note, or Retake now / Later)', () => {
    render(
      <ScoreReport
        {...holes}
        headingLevel={2}
        idBase=":r1:"
        footer={<p>Okay that's fine.</p>}
      />,
    );
    expect(screen.getByText("Okay that's fine.")).toBeDefined();
  });

  it('adds up the lesson total the attempt ended on, under the set averages', () => {
    const { container } = render(
      <ScoreReport
        {...holes}
        score={lessonTotalScore({ video: 1, quiz: 0.8, debrief: 0.515 }, 85)}
        headingLevel={2}
        idBase=":r1:"
      />,
    );
    expect(container.textContent).toContain(
      'Video 50 + Quiz 20 + Debrief 12.9 = 82.9 · pass mark 85',
    );
  });

  it('hands its heading to the ref it is given, focusable, so the result is read first', () => {
    let heading: HTMLHeadingElement | null = null;
    render(
      <ScoreReport
        {...holes}
        headingLevel={3}
        idBase=":r1:"
        headingRef={(el) => {
          heading = el;
        }}
      />,
    );
    expect((heading as unknown as HTMLElement).textContent).toBe(
      'Not passed this time',
    );
    expect((heading as unknown as HTMLElement).tabIndex).toBe(-1);
  });

  it('labels the revisit section by a heading id derived from the idBase it is given', () => {
    const { container } = render(
      <>
        <ScoreReport {...holes} headingLevel={2} idBase=":a:" />
        <ScoreReport {...holes} headingLevel={2} idBase=":b:" />
      </>,
    );
    const sections = [...container.querySelectorAll('section')];
    expect(sections.map((s) => s.getAttribute('aria-labelledby'))).toEqual([
      ':a:-revisit-heading',
      ':b:-revisit-heading',
    ]);
    for (const section of sections) {
      const id = section.getAttribute('aria-labelledby') as string;
      expect(document.getElementById(id)?.textContent).toBe('Worth revisiting');
    }
  });
});

describe('setSummary', () => {
  it('shows the score alone for an attempt from before sets', () => {
    expect(setSummary({ passed: false, score: 80, setAverages: [] })).toBe(
      'Score 80.',
    );
  });
});
