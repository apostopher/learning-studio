// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScoreReport } from '../score-report';

// Capture what the ring was handed: the report's number IS the ring's prop.
const ringProps = vi.hoisted(() => [] as { score: number }[]);
vi.mock('../score-ring', () => ({
  ScoreRing: (props: { score: number }) => {
    ringProps.push(props);
    return null;
  },
}));

const holes = {
  mastery: { cleared: 5, total: 7, percent: 71, passed: false },
  revisitNotes: [
    'Lift depends on airspeed squared, so halving speed quarters lift — your answer said it halves.',
    'A stall is about angle of attack, not speed; you tied it to a minimum speed.',
  ],
};

describe('ScoreReport', () => {
  it('rings the mastery percent and states the cleared count', () => {
    ringProps.length = 0;
    render(<ScoreReport {...holes} headingLevel={2} idBase=":r1:" />);
    expect(ringProps.at(-1)?.score).toBe(71);
    expect(screen.getByText('5 of 7 knowledge chunks cleared')).toBeDefined();
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

  it('a pass rings 100 and lists nothing to revisit', () => {
    ringProps.length = 0;
    render(
      <ScoreReport
        mastery={{ cleared: 7, total: 7, percent: 100, passed: true }}
        revisitNotes={['should not show']}
        headingLevel={2}
        idBase=":r1:"
      />,
    );
    expect(ringProps.at(-1)?.score).toBe(100);
    expect(screen.getByText('7 of 7 knowledge chunks cleared')).toBeDefined();
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

  it('renders the footer it is given, and offers no Retake button', () => {
    render(
      <ScoreReport
        {...holes}
        headingLevel={2}
        idBase=":r1:"
        footer={<p>Your next debrief opens in 6 h</p>}
      />,
    );
    expect(screen.getByText('Your next debrief opens in 6 h')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Retake/ })).toBeNull();
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
