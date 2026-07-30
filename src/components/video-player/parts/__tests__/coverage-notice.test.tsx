// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoverageNotice } from '../coverage-notice';

describe('CoverageNotice', () => {
  it('reports how much of the video has actually been watched', () => {
    render(<CoverageNotice hit={12} total={18} />);
    const text = screen.getByRole('status').textContent ?? '';
    // The student watched to the end by seeking; from their side the app looks
    // broken unless it says what is actually missing.
    expect(text).toContain('12');
    expect(text).toContain('18');
  });
});
