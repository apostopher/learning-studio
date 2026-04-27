import type { VideoPlayerLabels } from './types';

export const DEFAULT_LABELS: VideoPlayerLabels = {
  player: 'Video player',
  play: 'Play',
  pause: 'Pause',
  mute: 'Mute',
  unmute: 'Unmute',
  captionsOn: 'Turn captions off',
  captionsOff: 'Turn captions on',
  fullscreenEnter: 'Enter fullscreen',
  fullscreenExit: 'Exit fullscreen',
  volume: 'Volume',
  seek: 'Seek',
  playbackRate: 'Playback rate',
  retry: 'Retry',
  loading: 'Loading',
  buffering: 'Buffering',
  error: 'Playback error',
};

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
