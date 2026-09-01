// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryLesson } from '#/lib/admin-schemas';

// ClampedText measures with `useRef`, and react-compiler nulls the hook
// dispatcher for this repo's components under vitest — rendering it here fails
// before any assertion runs.
//
// The stub FORWARDS `className`, which the real component does. An earlier
// version dropped it, and that is exactly what made the width assertion below
// unfalsifiable: with no class on the name, the only `flex-1` in the tree was
// the card's own wrapper, so `closest('.flex-1')` matched whatever the name
// was styled with. A lossy stub does not just weaken a test, it can make one
// that cannot fail.
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text, className }: { text: string; className?: string }) => (
    <span className={className}>{text}</span>
  ),
}));

import { LibraryLessonCard } from '../library-lesson-card';

const lesson = (over: Partial<LibraryLesson> = {}): LibraryLesson => ({
  id: 1,
  name: 'Crosswind landings',
  slug: 'crosswind-landings',
  isConfigured: true,
  isAvailable: true,
  courseCount: 0,
  levels: [],
  requiredSubscriptions: [],
  hasDebrief: false,
  needsVideoWatch: false,
  ...over,
});

describe('LibraryLessonCard', () => {
  /**
   * The "in N courses" badge is GONE, and its absence is a decision rather
   * than an oversight — three tests used to pin its wording and its
   * singular/plural. The column is 320px wide, the lesson name is what gets
   * scanned for, and a cross-reference repeating on nearly every card had
   * earned none of that width. Where a lesson is taught is answered by the
   * course rail being on screen beside the library.
   *
   * `courseCount` stays on the type and is still read elsewhere — the delete
   * confirmation names it, since deleting a lesson takes it out of every
   * course at once.
   */
  it('shows no course-count badge, whatever the count', () => {
    // Every count, because the old badge was conditional on `> 0` — testing
    // only the zero case would pass against a badge that had simply been
    // left in place.
    for (const courseCount of [0, 1, 5]) {
      const { container, unmount } = render(
        <LibraryLessonCard lesson={lesson({ courseCount })} />,
      );
      expect(screen.queryByLabelText(/in \d+ courses?/i)).toBeNull();
      // The label query alone is not enough: a badge rendered with an empty
      // or numeric `aria-label` would satisfy it while still taking the
      // width. The chip's own tone class is the element-level check.
      expect(container.querySelector('.bg-apple-3')).toBeNull();
      expect(container.textContent).not.toMatch(/course/i);
      unmount();
    }
  });

  it('gives the name the width the badge used to take', () => {
    // Asserted on the name element's OWN class list. An earlier version used
    // `closest('.flex-1')`, which walked up to the card's wrapper — that
    // ancestor carries `flex-1` in every case, so the assertion passed even
    // against a mutant that stripped `flex-1` from the name and parked a
    // spacer in its place. It could not fail, which is worse than not
    // existing.
    render(
      <LibraryLessonCard lesson={lesson({ name: 'Crosswind landings' })} />,
    );
    expect(screen.getByText('Crosswind landings').className).toContain(
      'flex-1',
    );
  });

  it('never dims or disables a card that is used in courses', () => {
    // "Used" isn't a boolean, so nothing on this card should grey out or
    // become inert because courseCount > 0.
    // Mutant: the outer card wrapper gets `aria-disabled={lesson.courseCount > 0}`
    // (the exact bug this rule guards against — dimming a "used" card). This
    // assertion fails against that mutant because it would find that
    // attribute in the container.
    //
    // ARIA-clean is not the whole rule: a wrapper with `opacity-50` is
    // visually dimmed with no ARIA footprint at all, which the two queries
    // above would miss entirely. The rule is "never dimmed", so the wrapper's
    // own class list is checked directly for an `opacity-` utility.
    const { container } = render(
      <LibraryLessonCard
        lesson={lesson({ courseCount: 3 })}
        onEdit={vi.fn()}
      />,
    );
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
    expect(container.querySelector('[disabled]')).toBeNull();
    const wrapper = container.firstElementChild;
    expect(wrapper?.className ?? '').not.toMatch(/(?:^|\s)opacity-\S+/);
  });

  it('marks an unpublished lesson as a draft, in words', () => {
    // Mutant: the condition is inverted (`lesson.isAvailable &&` instead of
    // `!lesson.isAvailable &&`), so an unpublished lesson shows no marker —
    // this assertion fails against that mutant.
    render(<LibraryLessonCard lesson={lesson({ isAvailable: false })} />);
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('says nothing about drafts for a published lesson', () => {
    // Mutant: the Draft marker is always rendered regardless of
    // `isAvailable`. This assertion fails against that mutant.
    render(<LibraryLessonCard lesson={lesson({ isAvailable: true })} />);
    expect(screen.queryByText('Draft')).toBeNull();
  });
});
