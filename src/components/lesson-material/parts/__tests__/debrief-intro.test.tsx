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
        clearedSome={false}
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
        clearedSome={false}
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
          clearedSome={false}
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
          clearedSome={false}
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

  it('says how the debrief is done before the pilot starts, with no per-answer number', () => {
    render(
      <DebriefIntro
        loading={false}
        onStart={vi.fn()}
        readOnly={false}
        retake={false}
        clearedSome={false}
      />,
    );
    expect(
      screen.getByText(
        'Each question checks one knowledge chunk of this lesson, answered in your own words. Show you have got every chunk and the debrief is done. Your answer saves as you type, so you can come back and finish later.',
      ),
    ).toBeDefined();
  });

  it('says a retake asks fresh questions on what is not yet cleared, plus review of what is', () => {
    render(
      <DebriefIntro
        loading={false}
        onStart={vi.fn()}
        readOnly={false}
        retake={true}
        clearedSome={true}
      />,
    );
    expect(
      screen.getByText(
        'Fresh questions on the knowledge chunks you have not shown yet, plus one or two you have, answered in your own words. Show you have got every chunk and the debrief is done. Your answer saves as you type, so you can come back and finish later.',
      ),
    ).toBeDefined();
  });

  it('promises no review of cleared chunks when nothing is cleared yet (e.g. only legacy attempts)', () => {
    render(
      <DebriefIntro
        loading={false}
        onStart={vi.fn()}
        readOnly={false}
        retake={true}
        clearedSome={false}
      />,
    );
    expect(
      screen.getByText(
        'Fresh questions on the knowledge chunks you have not shown yet, answered in your own words. Show you have got every chunk and the debrief is done. Your answer saves as you type, so you can come back and finish later.',
      ),
    ).toBeDefined();
    expect(screen.queryByText(/one or two you have/)).toBeNull();
  });

  it('says it is preparing while the questions are written', () => {
    render(
      <DebriefIntro
        loading={true}
        onStart={vi.fn()}
        readOnly={false}
        retake={false}
        clearedSome={false}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Preparing debrief/ }),
    ).toBeDefined();
  });
});
