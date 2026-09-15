// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardLesson } from '#/lib/admin-schemas';

// ClampedText measures with `useRef`, and react-compiler nulls the hook
// dispatcher for this repo's components under vitest — rendering it here fails
// before any assertion runs. Stubbed to a plain span: the name it renders is
// all these tests read from it.
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

import { LessonCard } from '../lesson-card';

const lesson = (over: Partial<BoardLesson> = {}): BoardLesson => ({
  id: 1,
  name: 'Crosswind landings',
  slug: 'crosswind-landings',
  rank: 1,
  isAvailable: true,
  hasDebrief: false,
  needsVideoWatch: true,
  requiredSubscriptions: [],
  levels: [],
  isConfigured: true,
  quizQuestionCount: 0,
  dependsOn: [],
  videoProvider: 'mux',
  videoRef: 'ref',
  ...over,
});

describe('LessonCard', () => {
  it('marks an unpublished lesson as a draft, in words', () => {
    // The dot this replaced was aria-hidden, so published/draft was invisible
    // to a screen reader and the board carried no other cue.
    render(<LessonCard lesson={lesson({ isAvailable: false })} />);
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('says nothing about drafts for a published lesson', () => {
    render(<LessonCard lesson={lesson({ isAvailable: true })} />);
    expect(screen.queryByText('Draft')).toBeNull();
  });

  it('offers playback only when a video is assigned', () => {
    const onPlay = vi.fn();
    const { unmount } = render(
      <LessonCard lesson={lesson({ isConfigured: true })} onPlay={onPlay} />,
    );
    expect(screen.queryByRole('button', { name: /play/i })).toBeTruthy();
    unmount();

    render(
      <LessonCard lesson={lesson({ isConfigured: false })} onPlay={onPlay} />,
    );
    expect(screen.queryByRole('button', { name: /play/i })).toBeNull();
  });

  it('keeps draft state and video state independent', () => {
    // Two facts about one lesson; the tile carries one and the badge the
    // other, so every combination stays readable.
    render(
      <LessonCard
        lesson={lesson({ isAvailable: false, isConfigured: false })}
      />,
    );
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByRole('img', { name: /no video/i })).toBeTruthy();
  });

  it('hands the poster it was given to the video tile', () => {
    // The wiring test. A prop-existence check would pass while the card
    // quietly dropped the url on the floor; this fails the moment the tile
    // stops receiving it.
    const { container } = render(
      <LessonCard
        lesson={lesson({ isConfigured: true })}
        posterUrl="https://image.mux.com/abc/thumbnail.jpg"
        onPlay={vi.fn()}
      />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://image.mux.com/abc/thumbnail.jpg',
    );
  });

  it('renders the quickshot slot it was handed', () => {
    // The chips reach the board through this slot and nowhere else, so a card
    // that accepts the node and never renders it would leave every lesson's
    // settings unreachable while every other test still passed.
    render(
      <LessonCard
        lesson={lesson()}
        quickshotSlot={<span>quickshot chips</span>}
      />,
    );

    expect(screen.getByText('quickshot chips')).toBeTruthy();
  });

  it('still renders as a single row when no quickshot is given', () => {
    // The drag overlay and the module overlay's static list pass no slot;
    // neither should sprout an empty second row.
    render(<LessonCard lesson={lesson()} />);

    expect(screen.queryByText('quickshot chips')).toBeNull();
    expect(screen.getByText('Crosswind landings')).toBeTruthy();
  });

  it('flags a lesson the course also teaches in other modules', () => {
    // Mutant: the `alsoIn && alsoIn.length > 0` guard is dropped or the chip
    // text is built wrong. This assertion fails against that mutant because
    // the exact joined text would not resolve.
    render(<LessonCard lesson={lesson()} alsoIn={['Weather', 'Nav']} />);
    expect(screen.getByText('Also in Weather, Nav')).toBeTruthy();
  });

  it('draws no duplicate chip for a lesson placed once', () => {
    // Mutant: the chip renders unconditionally once `alsoIn` is passed at
    // all, even when it's empty. This assertion fails against that mutant
    // because `queryByText(/^Also in/)` would then resolve.
    render(<LessonCard lesson={lesson()} alsoIn={[]} />);
    expect(screen.queryByText(/^Also in/)).toBeNull();
  });

  it('shows the drag grip when the caller hands it drag handle props', () => {
    // Mutant: the grip button always renders regardless of `dragHandleProps`.
    // This assertion alone would still pass against that mutant — the
    // negative case below is what actually catches it.
    render(<LessonCard lesson={lesson()} dragHandleProps={{}} />);
    expect(
      screen.getByRole('button', { name: 'Drag to reorder lesson' }),
    ).toBeTruthy();
  });

  it('draws no drag grip for a read-only card', () => {
    // A card with no `dragHandleProps` has nothing for a grip to do — a
    // focusable, cursor-grab button that refuses every drag is exactly the
    // "control that looks live and is not" hazard `BorrowedLessonList`
    // exists to avoid. Mutant: the `dragHandleProps &&` guard is dropped, so
    // the grip renders unconditionally. This assertion fails against that
    // mutant because the query would then resolve to an element.
    render(<LessonCard lesson={lesson()} />);
    expect(
      screen.queryByRole('button', { name: 'Drag to reorder lesson' }),
    ).toBeNull();
  });
  /**
   * The card's hover and keyboard-focus treatment: an outline in ITPS's
   * orange (`warning-9`, 6.5:1 on gray-2 — a 60+ pilot can see it), colour-
   * only so nothing shifts under the cursor, and `has-focus-visible` rather
   * than `focus-within` so a mouse click on the card's own buttons does not
   * leave the outline stuck on. Mutant: the classes dropped from the root —
   * every other assertion in this file still passes.
   */
  it('outlines itself in the accent orange on hover and on keyboard focus within, without moving', () => {
    const { container } = render(<LessonCard lesson={lesson()} />);
    const root = container.firstElementChild as HTMLElement;
    const cls = root.className;
    expect(cls).toContain('hover:outline-warning-9');
    expect(cls).toContain('has-focus-visible:outline-warning-9');
    expect(cls).toContain('outline-transparent');
    expect(cls).toContain('transition-[outline-color,background-color]');
    expect(cls).not.toMatch(/hover:(scale|-?translate)/);
  });
});
