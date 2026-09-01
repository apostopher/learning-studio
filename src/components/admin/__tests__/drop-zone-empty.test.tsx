// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DropZoneEmpty } from '../drop-zone-empty';

describe('DropZoneEmpty', () => {
  it('shows its message and its action', () => {
    render(
      <DropZoneEmpty
        message="No lessons yet."
        action={<button type="button">Create module</button>}
      />,
    );
    expect(screen.getByText('No lessons yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create module' })).toBeTruthy();
  });

  it('renders no action when it is given none', () => {
    // An empty MODULE has nothing to offer but the drop itself — only an
    // empty COURSE carries a button. Mutant: a default action baked in.
    const { container } = render(<DropZoneEmpty message="No lessons yet." />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('marks itself as a live target while a drag is over it', () => {
    const { container } = render(
      <DropZoneEmpty message="Drop here." isOver={true} />,
    );

    // The accent border is the only signal that the drop will land — a zone
    // that looked identical hovered and not would leave the admin guessing
    // whether they had hit it. Mutant: `isOver` accepted and never read.
    const zone = container.firstElementChild;
    expect(zone?.className).toContain('border-apple-9');
  });

  it('stays neutral when nothing is over it', () => {
    const { container } = render(<DropZoneEmpty message="Drop here." />);

    const zone = container.firstElementChild;
    expect(zone?.className).toContain('border-gray-7');
    expect(zone?.className).not.toContain('border-apple-9');
  });
});
