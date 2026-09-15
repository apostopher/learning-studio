// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LibraryUntitled } from '../library-untitled';

describe('LibraryUntitled', () => {
  it('is titled Untitled, holds what it is given, and offers no controls at all', () => {
    render(
      <LibraryUntitled lessonCount={2}>
        <p>card a</p>
        <p>card b</p>
      </LibraryUntitled>,
    );
    expect(screen.getByText('Untitled')).toBeTruthy();
    expect(screen.getByText('2 lessons')).toBeTruthy();
    expect(screen.getByText('card a')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
  it('says every lesson is in a module when empty', () => {
    render(<LibraryUntitled lessonCount={0} />);
    expect(screen.getByText('Every lesson is in a module')).toBeTruthy();
  });
});
