// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeleteLessonWarning } from '../delete-lesson-warning';

/**
 * The copy in front of an irreversible act. Asserted on the rendered text
 * rather than on a string constant: this sentence exists to be read by a
 * person, and a test against the source constant would pass for copy that
 * never reaches the dialog.
 */
describe('delete-lesson confirmation copy', () => {
  it('says what is erased, that no course is involved, and that it is final', () => {
    const { container } = render(<DeleteLessonWarning name="Intro" />);

    expect(container.textContent).toContain('Intro is not in any course.');
    expect(container.textContent).toMatch(/permanently/i);
    expect(container.textContent).not.toMatch(/everywhere/i);
  });
});
