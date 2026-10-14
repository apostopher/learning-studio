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

  it('asks for CORS on the media element so a cross-origin caption track is allowed to load', () => {
    // Both providers serve captions from another origin (Synthesia: S3).
    // Without `crossorigin` the browser refuses to fetch the <track> at all —
    // the CC button then toggles a track that never loaded.
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(<VideoPlayer {...MIN_PROPS} videoRef={ref} />);
    const video = container.querySelector('video');
    expect(video?.getAttribute('crossorigin')).toBe('anonymous');
  });

  it('renders one subtitles <track> per caption, the first one default', () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        captions={[
          { src: 'en.vtt', lang: 'en', label: 'English' },
          { src: 'fr.vtt', lang: 'fr', label: 'French' },
        ]}
      />,
    );
    const tracks = [...container.querySelectorAll('track')];
    expect(
      tracks.map((t) => [
        t.getAttribute('src'),
        t.getAttribute('srclang'),
        t.getAttribute('label'),
        t.getAttribute('kind'),
        t.hasAttribute('default'),
      ]),
    ).toEqual([
      ['en.vtt', 'en', 'English', 'subtitles', true],
      ['fr.vtt', 'fr', 'French', 'subtitles', false],
    ]);
  });

  it('a plain src (no captions, no languages) shows no CC button and no language menu', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        actions={{ onCaptionsToggle: vi.fn(), onLanguageChange: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('button', { name: /captions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /language/i })).toBeNull();
  });

  it('hides captions button when no captions are provided', () => {
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

  it('shows captions button when captions are provided and onCaptionsToggle is set', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        captions={[{ src: 'cap.vtt', lang: 'en', label: 'English' }]}
        state={{ captionsEnabled: true }}
        actions={{ onCaptionsToggle: vi.fn() }}
      />,
    );
    expect(
      screen.getByRole('button', { name: /captions/i, pressed: true }),
    ).toBeTruthy();
  });

  it('shows an explanatory captions indicator — focusable and with visible text, not just an aria-label — when captions are known to be unavailable', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        state={{ captionsUnavailable: true }}
        actions={{ onCaptionsToggle: vi.fn() }}
      />,
    );
    const button = screen.getByRole('button', {
      name: 'Captions are not available for this video',
    }) as HTMLButtonElement;
    // Native `disabled` would pull the control out of the tab order,
    // hiding the one thing that explains a missing caption track from
    // keyboard/screen-reader users — `aria-disabled` keeps it reachable.
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    // The disclosure has to be visible text, not colour/opacity alone —
    // this is the text a sighted mouse user sees without needing the
    // accessible name at all.
    expect(screen.getByText('No captions')).toBeTruthy();
  });

  it('does not show the unavailable indicator once real caption tracks are supplied, even if captionsUnavailable lingers true', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        captions={[{ src: 'cap.vtt', lang: 'en', label: 'English' }]}
        state={{ captionsUnavailable: true }}
        actions={{ onCaptionsToggle: vi.fn() }}
      />,
    );
    expect(
      screen.queryByRole('button', {
        name: 'Captions are not available for this video',
      }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: /captions/i })).toBeTruthy();
  });

  it('omits the native src attribute for kind="hls" so a container-driven attachMedia effect owns it', () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoPlayer {...MIN_PROPS} kind="hls" videoRef={ref} />,
    );
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBeNull();
  });

  it('sets the native src attribute for kind="file" (the default)', () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(<VideoPlayer {...MIN_PROPS} videoRef={ref} />);
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe(MIN_PROPS.src);
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

  const LANGS = [
    { code: 'en', badge: 'EN', label: 'English' },
    { code: 'fr-CA', badge: 'FR-CA', label: 'Canadian French' },
  ];

  it('hides the language menu when only one language is offered', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        languages={[LANGS[0]]}
        activeLanguage="en"
        actions={{ onLanguageChange: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('button', { name: /language/i })).toBeNull();
  });

  it('names the active language on the trigger and calls onLanguageChange with the chosen code', async () => {
    const ref = createRef<HTMLVideoElement>();
    const onLanguageChange = vi.fn();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        languages={LANGS}
        activeLanguage="en"
        actions={{ onLanguageChange }}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Language: English' });
    expect(trigger.textContent).toContain('EN');
    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Canadian French/ }),
    );
    expect(onLanguageChange).toHaveBeenCalledWith('fr-CA');
  });
});
