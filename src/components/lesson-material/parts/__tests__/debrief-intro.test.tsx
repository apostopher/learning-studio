// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DebriefIntro } from '../debrief-intro';

describe('DebriefIntro', () => {
  it('fires onStart when pressed normally', async () => {
    const onStart = vi.fn();
    render(<DebriefIntro loading={false} onStart={onStart} readOnly={false} />);

    await userEvent.click(
      screen.getByRole('button', { name: /Start debrief/ }),
    );
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('is enabled and carries no reason when not read-only', () => {
    render(<DebriefIntro loading={false} onStart={vi.fn()} readOnly={false} />);
    const button = screen.getByRole('button', { name: /Start debrief/ });
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  describe('read-only', () => {
    it('disables Start and never fires it, even if clicked', async () => {
      const onStart = vi.fn();
      render(
        <DebriefIntro loading={false} onStart={onStart} readOnly={true} />,
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
        <DebriefIntro loading={false} onStart={vi.fn()} readOnly={true} />,
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
});
