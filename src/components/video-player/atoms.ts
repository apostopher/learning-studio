import { atom } from 'jotai';
import { atomFamily } from 'jotai-family';
import type { ReattachRequest } from './media-failure';
import type { VideoPlayerState } from './types';

export const INITIAL_VIDEO_PLAYER_STATE: VideoPlayerState = {
  paused: true,
  currentTime: 0,
  duration: 0,
  bufferedEnd: 0,
  volume: 1,
  muted: false,
  playbackRate: 1,
  captionsEnabled: false,
  hasCaptions: false,
  captionsUnavailable: false,
  fullscreen: false,
  status: 'idle',
  hasPlayedOnce: false,
  controlsVisible: true,
};

export const videoPlayerStateAtomFamily = atomFamily((_id: string) =>
  atom<VideoPlayerState>({ ...INITIAL_VIDEO_PLAYER_STATE }),
);

/**
 * The latest settled recovery for this player — see `ReattachRequest` in
 * `media-failure.ts`. Its own atom, not a `VideoPlayerState` field: it is a
 * container-internal attach trigger, never something the view draws.
 */
export const videoPlayerReattachAtomFamily = atomFamily((_id: string) =>
  atom<ReattachRequest>(null),
);
