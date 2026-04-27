// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LineProgress } from '../line-progress';

describe('LineProgress', () => {
  it('exposes the value via aria-valuenow', () => {
    render(<LineProgress value={42} ariaLabel="Test progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Test progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('renders with 0 when progress has not started', () => {
    render(<LineProgress value={0} ariaLabel="Test progress" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
  });

  it('accepts className override', () => {
    render(
      <LineProgress
        value={10}
        ariaLabel="Test progress"
        className="absolute inset-inline-0"
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.className).toContain('absolute');
  });
});
