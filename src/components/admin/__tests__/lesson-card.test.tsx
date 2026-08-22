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
});
