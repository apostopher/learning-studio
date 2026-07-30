// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminPreviewNote } from '../admin-preview-note';

describe('AdminPreviewNote', () => {
  it('states that the gates were bypassed', () => {
    render(<AdminPreviewNote />);
    // Decision #15's whole point: an admin must be able to tell a working gate
    // from a broken one, which requires the bypass to say so in words.
    expect(screen.getByText(/Admin preview\s*—\s*gates bypassed/)).toBeTruthy();
  });

  it('stays a modest one-liner rather than a banner', () => {
    const { container } = render(<AdminPreviewNote />);
    const note = container.firstElementChild;
    expect(note?.tagName).toBe('P');
    expect(note?.className).toContain('text-xs');
    expect(note?.className).toContain('text-tertiary');
  });
});
