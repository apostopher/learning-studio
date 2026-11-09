// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DebriefWait } from '../debrief-wait';

const TIME = 'Tue 28 Oct, 3:40 PM';
const common = { idBase: 'dw', headingLevel: 2 as const };

/**
 * Every waiting state must say why the debrief is closed and what opens it,
 * visibly AND in what assistive tech announces for the panel (spec
 * anti-goal: "a pilot stuck with no explanation" — "and say it in the
 * accessible name").
 */
describe('DebriefWait', () => {
  it('not-done on a video lesson: named for the video, which alone starts the clock', () => {
    render(
      <DebriefWait
        {...common}
        kind="not-done"
        courseSlug="uas-16-week-course"
        outstanding={[{ kind: 'video' }]}
      />,
    );
    expect(
      screen.getByRole('status', {
        name: 'Debrief locked until you watch the video',
        description: 'Opens 12 hours after you finish watching the video.',
      }),
    ).toBeDefined();
  });

  it('not-done without a video: named for the lock, described by what is left to finish', () => {
    render(
      <DebriefWait
        {...common}
        kind="not-done"
        courseSlug="uas-16-week-course"
        outstanding={[{ kind: 'quiz' }, { kind: 'section', section: 'links' }]}
      />,
    );
    const panel = screen.getByRole('status', {
      name: 'Debrief locked until you finish this lesson',
      description:
        'Opens 12 hours after you finish this lesson — take the quiz and open Links.',
    });
    expect(panel).toBeDefined();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Debrief locked until you finish this lesson',
      }),
    ).toBeDefined();
  });

  it('not-done with nothing listed still says what opens it', () => {
    render(
      <DebriefWait
        {...common}
        kind="not-done"
        courseSlug="uas-16-week-course"
        outstanding={[]}
      />,
    );
    expect(
      screen.getByRole('status', {
        description: 'Opens 12 hours after you finish this lesson.',
      }),
    ).toBeDefined();
  });

  it("not-done: names a remixed 3D lesson's closing tab by the course it is viewed in", () => {
    render(
      <DebriefWait
        {...common}
        kind="not-done"
        courseSlug="uas-16-week-course"
        outstanding={[{ kind: 'section', section: 'jobOfTheDay' }]}
      />,
    );
    expect(
      screen.getByRole('status', {
        description:
          'Opens 12 hours after you finish this lesson — open TEST THIS!.',
      }),
    ).toBeDefined();
  });

  it("waiting: the tester's copy is the name, today's to-do then the time is the description", () => {
    render(<DebriefWait {...common} kind="waiting" time={TIME} />);
    expect(
      screen.getByRole('status', {
        name: 'We will debrief this KC tomorrow.',
        description:
          'Today, just review the quiz, key points, pro tips and assignments. Opens Tue 28 Oct, 3:40 PM.',
      }),
    ).toBeDefined();
  });

  it('waiting before the client-only time renders: no dangling "Opens ."', () => {
    render(<DebriefWait {...common} kind="waiting" time={null} />);
    expect(
      screen.getByRole('status', {
        name: 'We will debrief this KC tomorrow.',
        description:
          'Today, just review the quiz, key points, pro tips and assignments.',
      }),
    ).toBeDefined();
  });

  it('retake-waiting: ONLY the reopen time — no score, no history', () => {
    render(<DebriefWait {...common} kind="retake-waiting" time={TIME} />);
    const panel = screen.getByRole('status', {
      name: 'Next attempt opens 12 hours after your last one',
      description: /Next attempt opens Tue 28 Oct, 3:40 PM\..*below 70/,
    });
    expect(panel.textContent).not.toMatch(/\d+\/100|correct/);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('takes the heading level of its context', () => {
    render(
      <DebriefWait idBase="dw" headingLevel={3} kind="waiting" time={TIME} />,
    );
    expect(screen.getByRole('heading', { level: 3 })).toBeDefined();
  });
});
