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
  /**
   * True when the source video is known to have no caption track at all —
   * as opposed to `hasCaptions` simply being false because no `tracks` were
   * passed yet (still loading). Distinguishing the two matters: a Mux video
   * always has this set (Mux text tracks aren't configured on this account),
   * and silently showing the same "no captions button" as a video that
   * simply hasn't loaded yet would hide that fact from a captions-dependent
   * viewer instead of disclosing it. See `CaptionsButton`'s `unavailable`.
   */
  captionsUnavailable: boolean;
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
  | 'captionsUnavailable'
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
  /**
   * How `src` must be played. Defaults to `'file'` (a plain progressive
   * download/stream) for every pre-existing caller. `'hls'` sources are never
   * set as the native `src` attribute here — Mux's manifests reach the
   * browser only through `attachMedia` (native Safari HLS, or a lazy-loaded
   * hls.js), which owns the element via `videoRef` instead. Setting the
   * manifest URL as a plain `src` here first would make non-Safari browsers
   * fire a real (if transient) media error before hls.js attaches.
   */
  kind?: 'hls' | 'file';
  videoRef: React.Ref<HTMLVideoElement>;
  rootRef?: React.Ref<HTMLDivElement>;
  tracks?: React.ComponentPropsWithoutRef<'track'>[];
  state?: Partial<VideoPlayerState>;
  actions?: VideoPlayerActions;
  playbackRates?: number[];
  labels?: Partial<VideoPlayerLabels>;
  overlay?: React.ReactNode;
};
