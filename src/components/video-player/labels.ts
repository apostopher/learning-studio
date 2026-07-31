import type { VideoPlayerLabels } from './types';

export const DEFAULT_LABELS: VideoPlayerLabels = {
  player: 'Video player',
  play: 'Play',
  pause: 'Pause',
  mute: 'Mute',
  unmute: 'Unmute',
  captionsOn: 'Turn captions off',
  captionsOff: 'Turn captions on',
  captionsUnavailable: 'Captions are not available for this video',
  // Short, ALWAYS-VISIBLE text next to the icon — see CaptionsButton. The
  // accessible name above stays the full sentence for screen readers; this
  // one has to fit inline in the control bar without crowding out the other
  // controls.
  captionsUnavailableShort: 'No captions',
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
