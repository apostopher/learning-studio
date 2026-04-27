// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from '../video-player';

const MIN_PROPS = {
  src: 'https://example.test/video.mp4',
};

describe('VideoPlayer', () => {
  it('renders only required props (paused, idle, no controls actions)', () => {
    const ref = createRef<HTMLVideoElement>();
    render(<VideoPlayer {...MIN_PROPS} videoRef={ref} />);
    expect(screen.getByRole('region', { name: 'Video player' })).toBeTruthy();
    const bigPlay = screen.getAllByRole('button', { name: 'Play' });
    expect(bigPlay.length).toBeGreaterThan(0);
  });

  it('hides captions button when no tracks are provided', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        actions={{ onCaptionsToggle: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('button', { name: /captions/i })).toBeNull();
  });

  it('shows captions button when tracks are provided and onCaptionsToggle is set', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        tracks={[
          {
            src: 'cap.vtt',
            srcLang: 'en',
            label: 'English',
            kind: 'subtitles',
          },
        ]}
        state={{ captionsEnabled: true }}
        actions={{ onCaptionsToggle: vi.fn() }}
      />,
    );
    expect(
      screen.getByRole('button', { name: /captions/i, pressed: true }),
    ).toBeTruthy();
  });

  it('hides fullscreen button when onFullscreenToggle is missing', () => {
    const ref = createRef<HTMLVideoElement>();
    render(<VideoPlayer {...MIN_PROPS} videoRef={ref} />);
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });

  it('renders error overlay when status is error and fires onRetry', async () => {
    const ref = createRef<HTMLVideoElement>();
    const onRetry = vi.fn();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        state={{ status: 'error', error: 'Could not load' }}
        actions={{ onRetry }}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Could not load')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('emits keyboard shortcut callback on root keydown', async () => {
    const ref = createRef<HTMLVideoElement>();
    const onKeyboardShortcut = vi.fn();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        actions={{ onKeyboardShortcut }}
      />,
    );
    const region = screen.getByRole('region', { name: 'Video player' });
    region.focus();
    await userEvent.keyboard(' ');
    expect(onKeyboardShortcut).toHaveBeenCalledWith(' ');
  });

  it('overrides player aria-label via labels prop', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        labels={{ player: 'Lesson video' }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Lesson video' })).toBeTruthy();
  });
});
