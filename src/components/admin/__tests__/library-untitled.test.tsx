// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LibraryUntitled } from '../library-untitled';

describe('LibraryUntitled', () => {
  it('lists root-level lessons with no Untitled heading and no controls', () => {
    render(
      <LibraryUntitled lessonCount={2}>
        <p>card a</p>
        <p>card b</p>
      </LibraryUntitled>,
    );
    expect(screen.getByText('card a')).toBeTruthy();
    expect(screen.getByText('card b')).toBeTruthy();
    expect(screen.queryByText(/Untitled/)).toBeNull();
    expect(screen.queryByText(/lessons?$/)).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('says nothing at rest when every lesson is in a module', () => {
    const { container } = render(<LibraryUntitled lessonCount={0} />);
    expect(container.textContent).toBe('');
  });

  /**
   * An empty shelf is still where a lesson goes to leave its module, so while
   * one is being dragged it must show a target that says what dropping does.
   */
  it('shows a drop zone on an empty shelf while a lesson is dragged', () => {
    render(<LibraryUntitled lessonCount={0} showDropZone />);
    expect(
      screen.getByText('Drop here to take it out of its module'),
    ).toBeTruthy();
  });

  it('never shows the drop zone over lessons already on the shelf', () => {
    render(
      <LibraryUntitled lessonCount={1} showDropZone>
        <p>card a</p>
      </LibraryUntitled>,
    );
    expect(screen.queryByText(/Drop here/)).toBeNull();
  });
});
