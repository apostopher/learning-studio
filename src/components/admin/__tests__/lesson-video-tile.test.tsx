// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LessonVideoTile } from '../lesson-video-tile';

describe('LessonVideoTile', () => {
  it('is a play control, named for its lesson, when there is a video', async () => {
    const onPlay = vi.fn();
    render(
      <LessonVideoTile
        hasVideo
        lessonName="Crosswind landings"
        onPlay={onPlay}
      />,
    );

    const button = screen.getByRole('button', {
      name: /play crosswind landings video/i,
    });
    await userEvent.click(button);
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('is not a control at all when the lesson has no video', () => {
    // Not a DISABLED button: there is nothing to play, and a control that
    // looks pressable and opens an empty modal is an affordance that lies.
    render(
      <LessonVideoTile
        hasVideo={false}
        lessonName="Crosswind landings"
        onPlay={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('never fires onPlay for a lesson with no video', async () => {
    const onPlay = vi.fn();
    render(
      <LessonVideoTile
        hasVideo={false}
        lessonName="Crosswind landings"
        onPlay={onPlay}
      />,
    );
    await userEvent.click(screen.getByRole('img'));
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('states the video state to a screen reader either way', () => {
    // The status dot this replaced was aria-hidden, so the board told screen
    // reader users nothing at all. Both states are announced now.
    const { unmount } = render(
      <LessonVideoTile hasVideo={false} lessonName="A" />,
    );
    expect(screen.getByRole('img', { name: /no video/i })).toBeTruthy();
    unmount();

    render(<LessonVideoTile hasVideo lessonName="A" />);
    expect(screen.getByRole('img', { name: /has a video/i })).toBeTruthy();
  });

  it('renders a plain marker where there is nowhere to open a modal', () => {
    // The drag overlay renders a card with no handlers; a play button there
    // would do nothing when pressed.
    render(<LessonVideoTile hasVideo lessonName="Crosswind landings" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
