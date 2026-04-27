import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
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
  fullscreen: false,
  status: 'idle',
  hasPlayedOnce: false,
  controlsVisible: true,
};

export const videoPlayerStateAtomFamily = atomFamily((_id: string) =>
  atom<VideoPlayerState>({ ...INITIAL_VIDEO_PLAYER_STATE }),
);
