import type * as React from 'react';

export type VideoPlayerStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'buffering'
  | 'error';

export type VideoPlayerState = {
  paused: boolean;
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  captionsEnabled: boolean;
  hasCaptions: boolean;
  fullscreen: boolean;
  status: VideoPlayerStatus;
  error?: string;
  hasPlayedOnce: boolean;
  controlsVisible: boolean;
};

export type VideoPlayerActions = {
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (time: number) => void;
  onSeekRelative?: (delta: number) => void;
  onVolumeChange?: (volume: number) => void;
  onMuteToggle?: () => void;
  onPlaybackRateChange?: (rate: number) => void;
  onCaptionsToggle?: () => void;
  onFullscreenToggle?: () => void;
  onRetry?: () => void;
  onPointerActivity?: () => void;
  onKeyboardShortcut?: (key: string) => void;
};

export type VideoPlayerLabelKey =
  | 'player'
  | 'play'
  | 'pause'
  | 'mute'
  | 'unmute'
  | 'captionsOn'
  | 'captionsOff'
  | 'fullscreenEnter'
  | 'fullscreenExit'
  | 'volume'
  | 'seek'
  | 'playbackRate'
  | 'retry'
  | 'loading'
  | 'buffering'
  | 'error';

export type VideoPlayerLabels = Record<VideoPlayerLabelKey, string>;

export type VideoPlayerProps = Omit<
  React.ComponentPropsWithoutRef<'video'>,
  'controls' | 'muted' | 'onPlay' | 'onPause' | 'ref' | 'children'
> & {
  src: string;
  videoRef: React.Ref<HTMLVideoElement>;
  rootRef?: React.Ref<HTMLDivElement>;
  tracks?: React.ComponentPropsWithoutRef<'track'>[];
  state?: Partial<VideoPlayerState>;
  actions?: VideoPlayerActions;
  playbackRates?: number[];
  labels?: Partial<VideoPlayerLabels>;
};
