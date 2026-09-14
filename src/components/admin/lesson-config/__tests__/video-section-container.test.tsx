// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
vi.mock('../video-preview', () => ({
  VideoPreview: () => <div data-testid="video-preview" />,
}));
vi.mock('../credential-flow-container', () => ({
  CredentialFlowContainer: () => <div data-testid="credential-flow" />,
}));

import { VideoSectionContainer } from '../video-section-container';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

function stubHooks(opts: { configured?: boolean } = {}) {
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
      { lessonId: 10, courseId: 7 },
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
      { lessonId: 10, courseId: 7 },
      false,
    );
  });
});
