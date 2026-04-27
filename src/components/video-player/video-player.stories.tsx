import type { Meta, StoryObj } from '@storybook/react-vite';
import { createRef } from 'react';
import { DEFAULT_LABELS } from './labels';
import { VideoPlayer } from './video-player';

const SAMPLE_SRC = 'https://download.samplelib.com/mp4/sample-5s.mp4';

const meta: Meta<typeof VideoPlayer> = {
  title: 'video-player/VideoPlayer',
  component: VideoPlayer,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof VideoPlayer>;

const noopActions = {
  onPlay: () => {},
  onPause: () => {},
  onSeek: () => {},
  onMuteToggle: () => {},
  onVolumeChange: () => {},
  onCaptionsToggle: () => {},
  onFullscreenToggle: () => {},
  onPlaybackRateChange: () => {},
  onRetry: () => {},
  onPointerActivity: () => {},
  onKeyboardShortcut: () => {},
};

export const Idle: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    state: { hasPlayedOnce: false, status: 'ready' },
    actions: noopActions,
  },
};

export const Loading: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    state: { status: 'loading' },
    actions: noopActions,
  },
};

export const Buffering: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    state: { status: 'buffering', hasPlayedOnce: true, paused: false },
    actions: noopActions,
  },
};

export const PlayingWithCaptions: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    tracks: [
      {
        src: 'https://example.test/captions.vtt',
        srcLang: 'en',
        label: 'English',
        kind: 'subtitles',
        default: true,
      },
    ],
    state: {
      hasPlayedOnce: true,
      paused: false,
      status: 'ready',
      currentTime: 12,
      duration: 45,
      bufferedEnd: 30,
      hasCaptions: true,
      captionsEnabled: true,
    },
    actions: noopActions,
  },
};

export const ErrorState: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    state: { status: 'error', error: 'Could not load this video.' },
    actions: { ...noopActions, onRetry: () => {} },
    labels: DEFAULT_LABELS,
  },
};

export const MinimalNoActions: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
  },
};
