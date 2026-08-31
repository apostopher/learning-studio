// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryLesson } from '#/lib/admin-schemas';

// ClampedText measures with `useRef`, and react-compiler nulls the hook
// dispatcher for this repo's components under vitest — rendering it here fails
// before any assertion runs. Stubbed to a plain span: the name it renders is
// all these tests read from it.
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

import { LibraryLessonCard } from '../library-lesson-card';

const lesson = (over: Partial<LibraryLesson> = {}): LibraryLesson => ({
  id: 1,
  name: 'Crosswind landings',
  slug: 'crosswind-landings',
  isConfigured: true,
  isAvailable: true,
  courseCount: 0,
  ...over,
});

describe('LibraryLessonCard', () => {
  it('gives the "used in" badge an accessible name spelling out the count', () => {
    // Mutant: badge's aria-label is the bare number (`aria-label={courseCount}`)
    // instead of the full sentence. A screen reader would announce "2" with
    // no context for what it counts — this must fail against that mutant.
    render(<LibraryLessonCard lesson={lesson({ courseCount: 2 })} />);
    expect(screen.getByLabelText(/in 2 courses/i)).toBeTruthy();
  });

  it('uses the singular for exactly one course, not "1 courses"', () => {
    // Mutant: the noun is hard-coded to "courses" (no singular/plural
    // branch). This assertion fails against that mutant because the
    // rendered label becomes "In 1 courses", which the exact string below
    // does not match.
    render(<LibraryLessonCard lesson={lesson({ courseCount: 1 })} />);
    expect(screen.getByLabelText('In 1 course')).toBeTruthy();
    expect(screen.queryByLabelText(/in 1 courses/i)).toBeNull();
  });

  it('shows no badge at all for a lesson used in zero courses', () => {
    // Mutant: the `courseCount > 0` guard is dropped, so the badge always
    // renders (as "In 0 courses" here). This assertion fails against that
    // mutant since the label would then resolve instead of being null.
    //
    // The label query alone is not enough: a badge rendered with
    // `aria-label=""` or `aria-label="0"` (still `role="img"`, still the
    // `soft-apple` chip) would satisfy `queryByLabelText(/in \d+ courses?/i)`
    // resolving to null while violating the actual rule — "no badge AT ALL"
    // — so this also asserts the chip element itself (identified by its
    // tone class, not by any text it might or might not carry) is absent.
    const { container } = render(
      <LibraryLessonCard lesson={lesson({ courseCount: 0 })} />,
    );
    expect(screen.queryByLabelText(/in \d+ courses?/i)).toBeNull();
    expect(container.querySelector('.bg-apple-3')).toBeNull();
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
