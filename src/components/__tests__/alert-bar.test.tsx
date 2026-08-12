// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertBar } from '../alert-bar';

describe('AlertBar', () => {
  it('renders the strip even with no child', () => {
    const { container } = render(<AlertBar />);
    expect(container.querySelector('.alert-bar')).not.toBeNull();
  });

  it('hides the empty strip from assistive tech', () => {
    // Empty, it is decorative chrome carrying no information. Announcing an
    // unlabelled element on every authed screen is noise.
    const { container } = render(<AlertBar />);
    const bar = container.querySelector('.alert-bar');
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
  });

  it('treats an explicitly null child the same as no child', () => {
    const { container } = render(<AlertBar>{null}</AlertBar>);
    const bar = container.querySelector('.alert-bar');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders a child and stops hiding itself, so the child owns its own role', () => {
    const { container } = render(
      <AlertBar>
        <p role="alert">SCHEDULED_MAINTENANCE</p>
      </AlertBar>,
    );
    const bar = container.querySelector('.alert-bar');
    expect(bar?.getAttribute('aria-hidden')).toBeNull();
    // The consumer's own role must actually reach the accessibility tree —
    // an aria-hidden ancestor would remove it.
    expect(screen.getByRole('alert').textContent).toBe('SCHEDULED_MAINTENANCE');
  });
});
