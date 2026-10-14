// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The three data hooks are the section's collaborators; each is stubbed so a
 * test can state what the server knows and read what the section drew.
 * `useLessonVideoPlayback` records its arguments — the assertion that
 * matters for the no-course case is that it was DISABLED, since the
 * playback route needs a course to sign the URL with.
 */
const hooks = vi.hoisted(() => ({
  credentials: vi.fn(),
  playback: vi.fn(),
  setVideo: vi.fn(),
  video: vi.fn(),
}));
vi.mock('#/data-hooks/use-lesson-video', () => ({
  useLessonVideo: hooks.video,
}));
vi.mock('#/data-hooks/use-course-credentials', () => ({
  useCourseCredentials: hooks.credentials,
}));
vi.mock('#/data-hooks/use-lesson-video-playback', () => ({
  useLessonVideoPlayback: hooks.playback,
}));
vi.mock('#/data-hooks/use-set-lesson-video', () => ({
  useSetLessonVideo: hooks.setVideo,
}));
// Captures its props: the callbacks the section hands the preview are how the
// shared player reaches back (language picked, recovery exhausted).
const preview = vi.hoisted(() =>
  vi.fn((_p: Record<string, unknown>) => <div data-testid="video-preview" />),
);
vi.mock('../video-preview', () => ({ VideoPreview: preview }));
// Renders the rejection it was handed: the dead-key notice is the flow's to
// show, so what the section owes it is that string.
vi.mock('../credential-flow-container', () => ({
  CredentialFlowContainer: ({
    providerRejection,
  }: {
    providerRejection?: string | null;
  }) => <div data-testid="credential-flow">{providerRejection}</div>,
}));
// Stubbed like the credential flow: it has its own data hooks, and what this
// file cares about is only WHEN the section mounts it (a lesson with a video).
vi.mock('../alternate-videos-container', () => ({
  AlternateVideosContainer: ({ lessonId }: { lessonId: number }) => (
    <div data-testid="alternate-videos" data-lesson-id={lessonId} />
  ),
}));

// Captures its props: what the section owes it is the lesson, course and
// previewed language the status is about.
const captionsStatus = vi.hoisted(() =>
  vi.fn((_p: Record<string, unknown>) => <div data-testid="captions-status" />),
);
vi.mock('../captions-status-container', () => ({
  CaptionsStatusContainer: captionsStatus,
}));

import { VideoSectionContainer } from '../video-section-container';

// A fresh jotai store per render: the preview-language atom family is keyed
// by lesson id, and every test here uses lesson 10 — a language picked in one
// test must not leak into the next through the default store.
const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider>
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  </Provider>
);

const readyPlayback = {
  status: 'ready' as const,
  url: 'https://stream.mux.com/abc.m3u8?token=t',
  kind: 'hls' as const,
  expiresInSeconds: 3600,
  poster: null,
  captions: null,
  lang: 'en' as const,
  languages: ['en' as const, 'fr' as const],
};

/** The props the section handed the preview on its latest render. */
const lastPreviewProps = () =>
  preview.mock.calls.at(-1)?.[0] as {
    playback: unknown;
    onLanguageChange?: (code: string) => void;
    onSourceExpired?: () => unknown;
    onPlaybackFailed?: (message: string) => void;
  };

function stubHooks(
  opts: {
    configured?: boolean;
    video?: { provider: 'mux' | 'synthesia'; ref: string } | null;
  } = {},
) {
  hooks.video.mockReturnValue({
    data: opts.video === undefined ? null : opts.video,
  });
  hooks.credentials.mockReturnValue({
    data: [{ provider: 'mux', configured: opts.configured ?? true }],
    isLoading: false,
    isError: false,
  });
  hooks.playback.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  hooks.setVideo.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  });
}

afterEach(() => vi.clearAllMocks());

describe('VideoSectionContainer without a course (library lesson placed nowhere)', () => {
  it('offers the URL field beside a placeholder thumbnail, and asks for no credentials or playback', () => {
    stubHooks();
    render(
      <VideoSectionContainer
        courseId={null}
        lesson={{ id: 10, videoProvider: null }}
      />,
      { wrapper },
    );
    expect(screen.getByLabelText('Video URL or ID')).toBeTruthy();
    expect(screen.getByTestId('video-preview')).toBeTruthy();
    expect(hooks.credentials).toHaveBeenCalledWith(null);
    expect(hooks.setVideo).toHaveBeenCalledWith(null);
    expect(hooks.playback).toHaveBeenCalledWith(null, false);
    expect(screen.queryByTestId('credential-flow')).toBeNull();
    // No primary video → nothing for a translation to be an alternate to.
    expect(screen.queryByTestId('alternate-videos')).toBeNull();
  });

  it('names the current video, keeps the URL field open, and says why there is no preview', () => {
    stubHooks();
    render(
      <VideoSectionContainer
        courseId={null}
        lesson={{ id: 10, videoProvider: 'mux' }}
      />,
      { wrapper },
    );
    expect(screen.getByText('Mux')).toBeTruthy();
    // Always the field — pasting a new URL replaces the video; there is no
    // toggle to find first, and the submit says what it will do.
    expect(screen.getByLabelText('Video URL or ID')).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Replace video' });
    expect(submit.getAttribute('type')).toBe('submit');
    expect(
      screen.getByText(
        'Preview and provider connection appear once this lesson is placed in a course.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('credential-flow')).toBeNull();
    // Other languages are a property of the lesson's video, not of a
    // course, so the section is offered even before the lesson is placed.
    expect(
      screen.getByTestId('alternate-videos').getAttribute('data-lesson-id'),
    ).toBe('10');
  });
});

describe('VideoSectionContainer with a course', () => {
  it('asks playback for that course and draws the thumbnail beside the field when the provider is connected', () => {
    stubHooks({ configured: true });
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
        previewNote="Preview is signed with the first course teaching this lesson."
      />,
      { wrapper },
    );
    expect(hooks.playback).toHaveBeenCalledWith(
      { lessonId: 10, courseId: 7, lang: 'en' },
      true,
    );
    expect(screen.getByTestId('video-preview')).toBeTruthy();
    expect(screen.getByLabelText('Video URL or ID')).toBeTruthy();
    expect(
      screen.getByText(
        'Preview is signed with the first course teaching this lesson.',
      ),
    ).toBeTruthy();
  });

  it('hands off to the credential flow when the provider is not connected', () => {
    stubHooks({ configured: false });
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    expect(screen.getByTestId('credential-flow')).toBeTruthy();
    expect(hooks.playback).toHaveBeenCalledWith(
      { lessonId: 10, courseId: 7, lang: 'en' },
      false,
    );
  });

  /**
   * A lesson that has a video opens with its URL already in the field — the
   * canonical URL for its provider, which the same detector reads back —
   * so the admin sees what is attached and can edit it in place rather than
   * paste from scratch. Mutant: `defaultValues: { url: '' }` alone.
   */
  it('prefills the URL field from the lesson’s current video', () => {
    stubHooks({ video: { provider: 'mux', ref: 'abc123' } });
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc123' }}
      />,
      { wrapper },
    );
    const input = screen.getByLabelText('Video URL or ID') as HTMLInputElement;
    expect(input.value).toBe('https://stream.mux.com/abc123.m3u8');
    expect(hooks.video).toHaveBeenCalledWith(10, true);
  });

  it('leaves the field empty, and asks for nothing, when the lesson has no video', () => {
    stubHooks();
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: null }}
      />,
      { wrapper },
    );
    expect(
      (screen.getByLabelText('Video URL or ID') as HTMLInputElement).value,
    ).toBe('');
    expect(hooks.video).toHaveBeenCalledWith(10, false);
  });
});

describe('VideoSectionContainer preview language', () => {
  function stubReady(over: Record<string, unknown> = {}) {
    stubHooks({ configured: true });
    hooks.playback.mockReturnValue({
      data: readyPlayback,
      isLoading: false,
      isError: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(),
      ...over,
    });
  }

  /**
   * The admin's preview language is its own per-lesson atom, so what the
   * player's menu picks must reach the PLAYBACK HOOK — that is what goes on
   * the wire. Asserting an atom changed would pass with the hook still
   * asking for English.
   */
  it('re-queries playback in the language picked from the player', () => {
    stubReady();
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    expect(lastPreviewProps().playback).toEqual(readyPlayback);

    act(() => lastPreviewProps().onLanguageChange?.('fr'));

    expect(hooks.playback.mock.calls.at(-1)?.[0]).toEqual({
      lessonId: 10,
      courseId: 7,
      lang: 'fr',
    });
  });

  it('ignores a code that is not a video language', () => {
    stubReady();
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    act(() => lastPreviewProps().onLanguageChange?.('xx-nope'));
    expect(hooks.playback.mock.calls.at(-1)?.[0]).toEqual({
      lessonId: 10,
      courseId: 7,
      lang: 'en',
    });
  });

  /**
   * While the new language resolves, the hook serves the old language as
   * placeholder data with `isLoading` false — so the old player stays
   * mounted (that is what lets it resume at the same spot) and the section
   * has to say what it is waiting for itself.
   */
  it('keeps the player mounted and says which language is loading during a switch', () => {
    stubReady();
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    hooks.playback.mockReturnValue({
      data: readyPlayback,
      isLoading: false,
      isError: false,
      isPlaceholderData: true,
      error: null,
      refetch: vi.fn(),
    });
    act(() => lastPreviewProps().onLanguageChange?.('fr'));

    expect(screen.getByText('Loading French…')).toBeTruthy();
    expect(lastPreviewProps().playback).toEqual(readyPlayback);
  });

  it('shows the dead-key notice when the player gives up recovering', () => {
    stubReady();
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    expect(screen.queryByTestId('credential-flow')).toBeNull();

    act(() => lastPreviewProps().onPlaybackFailed?.('x'));

    // Delivered to the credential flow, which owns the notice, and the
    // player is withdrawn — a dead key cannot play.
    expect(screen.getByTestId('credential-flow').textContent).toMatch(
      /the stored key is no longer valid/,
    );
    expect(lastPreviewProps().playback).toBeNull();
  });
});

/**
 * F2: the player holds the only language menu, so a previewed language that
 * cannot play (still rendering, failed, or the request errored) unmounts the
 * only way back. The section must name the language and offer the way back
 * itself — and the way back must reach the PLAYBACK HOOK.
 */
describe('VideoSectionContainer with a non-playable preview language', () => {
  function renderAndPickFrench(after: Record<string, unknown>) {
    stubHooks({ configured: true });
    hooks.playback.mockReturnValue({
      data: readyPlayback,
      isLoading: false,
      isError: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(),
    });
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    hooks.playback.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(),
      ...after,
    });
    act(() => lastPreviewProps().onLanguageChange?.('fr'));
  }

  it('names the language still rendering and goes back to English on request', () => {
    renderAndPickFrench({
      data: { status: 'rendering', lang: 'fr', languages: ['en', 'fr'] },
    });

    expect(
      screen.getByText(/The French video is still rendering/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to English' }));

    expect(hooks.playback.mock.calls.at(-1)?.[0]).toEqual({
      lessonId: 10,
      courseId: 7,
      lang: 'en',
    });
  });

  it('names the language whose request failed, with the reason, and goes back', () => {
    renderAndPickFrench({
      data: undefined,
      isError: true,
      error: new Error('Mux is not connected for this course'),
    });

    expect(
      screen.getByText(
        "The French video couldn't be loaded: Mux is not connected for this course",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to English' }));

    expect(hooks.playback.mock.calls.at(-1)?.[0]).toEqual({
      lessonId: 10,
      courseId: 7,
      lang: 'en',
    });
  });

  it('offers no way back while previewing English itself', () => {
    stubHooks({ configured: true });
    hooks.playback.mockReturnValue({
      data: { status: 'rendering', lang: 'en', languages: ['en'] },
      isLoading: false,
      isError: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(),
    });
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    expect(
      screen.queryByRole('button', { name: 'Back to English' }),
    ).toBeNull();
    expect(screen.getByText(/This video is still rendering/)).toBeTruthy();
  });
});

describe('VideoSectionContainer captions status', () => {
  it('hands the status line the lesson, course and previewed language', () => {
    stubHooks({ configured: true });
    hooks.playback.mockReturnValue({
      data: readyPlayback,
      isLoading: false,
      isError: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(),
    });
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    act(() => lastPreviewProps().onLanguageChange?.('fr'));
    expect(captionsStatus.mock.calls.at(-1)?.[0]).toEqual({
      lessonId: 10,
      courseId: 7,
      lang: 'fr',
    });
  });

  it('is not rendered without a course', () => {
    stubHooks();
    render(
      <VideoSectionContainer
        courseId={null}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    expect(captionsStatus).not.toHaveBeenCalled();
  });
});

/** F1: the player waits on what `onSourceExpired` returns before re-attaching. */
describe('VideoSectionContainer recovery', () => {
  it('hands the player the refetch promise as the recovery result', () => {
    stubHooks({ configured: true });
    const settled = Promise.resolve('refetched');
    hooks.playback.mockReturnValue({
      data: readyPlayback,
      isLoading: false,
      isError: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(() => settled),
    });
    render(
      <VideoSectionContainer
        courseId={7}
        lesson={{ id: 10, videoProvider: 'mux', videoRef: 'abc' }}
      />,
      { wrapper },
    );
    expect(lastPreviewProps().onSourceExpired?.()).toBe(settled);
  });
});
