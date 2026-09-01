// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DragRefusalNote } from '../drag-refusal-note';

describe('DragRefusalNote', () => {
  it('shows the reason it is given', () => {
    render(<DragRefusalNote reason="Create a module first." />);
    expect(screen.getByText('Create a module first.')).toBeTruthy();
  });

  it('is legible over whatever the drag is crossing', () => {
    // This note floats over poster thumbnails, chips and other cards. Its
    // first version was a 15% error tint, which left the text sitting on top
    // of all of it and often unreadable.
    //
    // Both halves are asserted because neither works alone: the blur removes
    // the high-frequency contrast underneath, and the near-opaque fill keeps
    // what remains from shifting the background far enough to cost
    // `error-text` its designed contrast. Mutant this catches: dropping back
    // to a translucent error fill (`bg-error-9/15`) because it looks nicer in
    // isolation.
    const { container } = render(<DragRefusalNote reason="Nope." />);
    const note = container.firstElementChild;

    expect(note?.className).toContain('backdrop-blur-2xl');
    expect(note?.className).toContain('bg-gray-1/90');
    expect(note?.className).not.toContain('bg-error-9/15');
  });

  it('keeps its error identity on the border, not the fill', () => {
    // The fill is carrying legibility; the border carries the meaning. A
    // mutant that dropped the error border would leave the note reading as a
    // neutral tooltip rather than a refusal.
    const { container } = render(<DragRefusalNote reason="Nope." />);
    expect(container.firstElementChild?.className).toContain('border-error-9');
    expect(container.firstElementChild?.className).toContain('text-error-text');
  });
});
