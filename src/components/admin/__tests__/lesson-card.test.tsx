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
});
