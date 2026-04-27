// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CircularProgress } from '../circular-progress';

describe('CircularProgress', () => {
  it('exposes value + bounds via ARIA and shows integer label', () => {
    render(<CircularProgress value={42} ariaLabel="Module progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Module progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.textContent).toContain('42%');
  });

  it('rounds fractional values in the label', () => {
    render(<CircularProgress value={66.6} ariaLabel="Module progress" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.textContent).toContain('67%');
  });

  it('clamps values above 100', () => {
    render(<CircularProgress value={150} ariaLabel="Module progress" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
  });

  it('hides the label when showLabel is false', () => {
    render(
      <CircularProgress
        value={25}
        ariaLabel="Module progress"
        showLabel={false}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.textContent).not.toContain('25%');
  });
});
