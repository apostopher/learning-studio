// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeleteLessonWarning } from '../delete-lesson-warning';
import { removeLessonLabel } from '../lesson-card-labels';

/** The label the knowledge editor's remove control actually wears. */
const REMOVE_LABEL = removeLessonLabel('Intro', 'Fundamentals');

/**
 * The copy in front of an irreversible, org-wide destructive action.
 *
 * Asserted on the rendered text rather than on a string constant: this
 * sentence exists to be read by a person, and a test against the source
 * constant would pass for copy that never reaches the dialog.
 */
describe('delete-lesson confirmation copy', () => {
  /**
   * Mutant seen RED: the count is dropped from the sentence
   * (`is taught by other courses.`). The whole reason `deleteLessonAtom` grew
   * a `courseCount` is that "are you sure?" does not tell anyone what they are
   * about to lose.
   */
  it('names how many courses lose the lesson', () => {
    const { container } = render(
      <DeleteLessonWarning
        name="Intro"
        courseCount={3}
        removeControlLabel={REMOVE_LABEL}
      />,
    );

    expect(container.textContent).toMatch(/taught by 3 courses/i);
    expect(container.textContent).toContain('Intro');
  });

  /**
   * Mutant seen RED: the noun is hard-coded plural, so a single-course lesson
   * reads "taught by 1 courses".
   */
  it('reads naturally in the singular for one course', () => {
    const { container } = render(
      <DeleteLessonWarning
        name="Intro"
        courseCount={1}
        removeControlLabel={REMOVE_LABEL}
      />,
    );

    expect(container.textContent).toMatch(/taught by 1 course\b/i);
    expect(container.textContent).not.toMatch(/1 courses/i);
  });

  /**
   * Delete and Remove must not read as synonyms. Two things carry that here:
   * the word "permanently", and naming the OTHER control by the exact label it
   * wears on the card, so someone who wanted the reversible act can find it.
   *
   * Mutant seen RED: the second sentence is dropped, leaving copy that states
   * the blast radius but never distinguishes the two actions — precisely the
   * blur this task exists to prevent.
   */
  it('says the act is permanent and points at the reversible one by name', () => {
    const { container } = render(
      <DeleteLessonWarning
        name="Intro"
        courseCount={3}
        removeControlLabel={REMOVE_LABEL}
      />,
    );

    expect(container.textContent).toMatch(/permanently/i);
    // The exact label the control wears, built from the same function the
    // control is built from — not a phrase hand-written here or there.
    expect(container.textContent).toContain(`“${REMOVE_LABEL}”`);
  });

  /**
   * The per-course board's card has no remove control at all, so on that
   * surface the sentence above would send the reader hunting for a button
   * that is nowhere on their screen. It names the screen that does have one
   * instead.
   *
   * Mutant seen RED: the `removeControlLabel === null` branch deleted, so the
   * quoted-label form runs everywhere — which is the defect this round was
   * opened for, restored verbatim.
   */
  it('names the editor, not a button, on a surface with no remove control', () => {
    const { container } = render(
      <DeleteLessonWarning
        name="Intro"
        courseCount={3}
        removeControlLabel={null}
      />,
    );

    expect(container.textContent).toMatch(/knowledge library editor/i);
    // And claims no control on the screen the reader is actually looking at.
    expect(container.textContent).not.toMatch(/on its card/i);
    expect(container.textContent).not.toMatch(/remove from module/i);
    // The blast radius is still stated, and it is still permanent.
    expect(container.textContent).toMatch(/taught by 3 courses/i);
    expect(container.textContent).toMatch(/permanently/i);
  });

  /**
   * A lesson in no course has no blast radius and no module to be removed
   * from, so both of those sentences would be false.
   *
   * Mutant seen RED: the `courseCount === 0` branch is deleted and the plural
   * sentence runs for every count, producing "is taught by 0 courses" and
   * pointing at a control that is nowhere on screen.
   */
  it('does not invent a blast radius for a lesson no course teaches', () => {
    const { container } = render(
      <DeleteLessonWarning
        name="Intro"
        courseCount={0}
        removeControlLabel={REMOVE_LABEL}
      />,
    );

    expect(container.textContent).toMatch(/not in any course/i);
    expect(container.textContent).not.toMatch(/0 courses/i);
    expect(container.textContent).not.toContain(REMOVE_LABEL);
    // Still says what it destroys, and that it cannot be taken back.
    expect(container.textContent).toMatch(/permanently/i);
  });
});
