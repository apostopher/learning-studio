// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DebriefWait } from '../debrief-wait';

/**
 * Every waiting state must say why the debrief is closed and what opens it,
 * visibly (spec anti-goal: "a pilot stuck with no explanation").
 */
describe('DebriefWait', () => {
  it('not-done: says it opens 24h after the lesson is finished, and what is left', () => {
    render(
      <DebriefWait
        kind="not-done"
        outstanding={[
          { kind: 'video' },
          { kind: 'quiz' },
          { kind: 'section', section: 'links' },
        ]}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Opens 24 hours after you finish this lesson — watch the video, take the quiz, and open Links.',
    );
  });

  it('not-done with nothing listed still says what opens it', () => {
    render(<DebriefWait kind="not-done" outstanding={[]} />);
    expect(screen.getByRole('status').textContent).toContain(
      'Opens 24 hours after you finish this lesson.',
    );
  });

  it('waiting: names the opening time it was given, and why it waits', () => {
    render(<DebriefWait kind="waiting" time="Tue 28 Oct, 3:40 PM" />);
    const text = screen.getByRole('status').textContent;
    expect(text).toContain('Opens Tue 28 Oct, 3:40 PM');
    expect(text).toContain('24 hours after you finished this lesson');
  });

  it('retake-waiting: ONLY the reopen time — no score, no history', () => {
    render(<DebriefWait kind="retake-waiting" time="Tue 28 Oct, 3:40 PM" />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain('Next attempt opens Tue 28 Oct, 3:40 PM');
    expect(text).toContain('below 70');
    expect(text).not.toMatch(/\d+\/100|correct/);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
