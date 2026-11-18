// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DebriefIntro } from '../debrief-intro';

describe('DebriefIntro', () => {
  it('fires onStart when pressed normally', async () => {
    const onStart = vi.fn();
    render(
      <DebriefIntro
        loading={false}
        onStart={onStart}
        readOnly={false}
        retake={false}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /Start debrief/ }),
    );
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('is enabled and carries no reason when not read-only', () => {
    render(
      <DebriefIntro
        loading={false}
        onStart={vi.fn()}
        readOnly={false}
        retake={false}
      />,
    );
    const button = screen.getByRole('button', { name: /Start debrief/ });
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  describe('read-only', () => {
    it('disables Start and never fires it, even if clicked', async () => {
      const onStart = vi.fn();
      render(
        <DebriefIntro
          loading={false}
          onStart={onStart}
          readOnly={true}
          retake={false}
        />,
      );

      const button = screen.getByRole('button', { name: /Start debrief/ });
      // aria-disabled, not native disabled: the control must stay in the
      // tab order (and thus reachable + its aria-describedby announced) for
      // a keyboard/screen-reader user — see Minor 3 of the review.
      expect(button.getAttribute('aria-disabled')).toBe('true');

      await userEvent.click(button);
      expect(onStart).not.toHaveBeenCalled();
    });

    it('states the reason where assistive tech reaches it, not just visually', () => {
      render(
        <DebriefIntro
          loading={false}
          onStart={vi.fn()}
          readOnly={true}
          retake={false}
        />,
      );

      const button = screen.getByRole('button', { name: /Start debrief/ });
      const describedById = button.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();

      const reason = document.getElementById(describedById as string);
      expect(reason).not.toBeNull();
      expect(reason?.textContent).toContain(
        'you completed this lesson at an earlier level',
      );
      expect(reason?.className).not.toContain('sr-only');
    });
  });

  const HOW =
    'Viper gives you feedback after each answer. Average 75 or more across the set and the debrief is done; if not, you get a second set on other key points, when the lesson has more. Your answer saves as you type, so you can come back and finish later.';

  it('says how the debrief works before the pilot starts: feedback after each answer, and the 75 rule', () => {
    render(
      <DebriefIntro
        loading={false}
        onStart={vi.fn()}
        readOnly={false}
        retake={false}
      />,
    );
    expect(
      screen.getByText(
        `A set of up to four questions, each on one of this lesson's key points, answered in your own words. ${HOW}`,
      ),
    ).toBeDefined();
  });

  it('says a retake is a fresh set that starts with the key points missed last time', () => {
    render(
      <DebriefIntro
        loading={false}
        onStart={vi.fn()}
        readOnly={false}
        retake={true}
      />,
    );
    expect(
      screen.getByText(
        `A fresh set of up to four questions, starting with the key points you missed last time, answered in your own words. ${HOW}`,
      ),
    ).toBeDefined();
  });

  it('says it is preparing while the questions are written', () => {
    render(
      <DebriefIntro
        loading={true}
        onStart={vi.fn()}
        readOnly={false}
        retake={false}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Preparing debrief/ }),
    ).toBeDefined();
  });
});
