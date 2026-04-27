import { useSetAtom } from 'jotai';
import { type RefObject, useEffect, useRef } from 'react';
import { videoPlayerStateAtomFamily } from './atoms';
import type { VideoPlayerState } from './types';

const HIDE_DELAY_MS = 2000;
const HIDE_LEAVE_DELAY_MS = 250;

export const useVideoPlayer = (
  playerId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  rootRef: RefObject<HTMLDivElement | null>,
) => {
  const setState = useSetAtom(videoPlayerStateAtomFamily(playerId));
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const patch = (p: Partial<VideoPlayerState>) =>
      setState((prev) => ({ ...prev, ...p }));

    const onLoadedMetadata = () =>
      patch({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        hasCaptions: video.textTracks.length > 0,
        status: 'ready',
      });
    const onTimeUpdate = () => patch({ currentTime: video.currentTime });
    const onPlay = () =>
      patch({ paused: false, hasPlayedOnce: true, status: 'ready' });
    const onPause = () => patch({ paused: true });
    const onVolumeChange = () =>
      patch({ volume: video.volume, muted: video.muted });
    const onRateChange = () => patch({ playbackRate: video.playbackRate });
    const onProgress = () => {
      const ranges = video.buffered;
      let bufferedEnd = 0;
      for (let i = 0; i < ranges.length; i++) {
        if (ranges.start(i) <= video.currentTime) {
          bufferedEnd = Math.max(bufferedEnd, ranges.end(i));
        }
      }
      patch({ bufferedEnd });
    };
    const onWaiting = () => patch({ status: 'buffering' });
    const onCanPlay = () => patch({ status: 'ready' });
    const onLoadStart = () => patch({ status: 'loading' });
    const onError = () =>
      patch({ status: 'error', error: video.error?.message });
    const onEnded = () => patch({ paused: true });

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('ratechange', onRateChange);
    video.addEventListener('progress', onProgress);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('ratechange', onRateChange);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadstart', onLoadStart);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
    };
  }, [videoRef, setState]);

  useEffect(() => {
    const onFsChange = () =>
      setState((prev) => ({
        ...prev,
        fullscreen: document.fullscreenElement === rootRef.current,
      }));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [rootRef, setState]);

  return {
    showControls() {
      setState((prev) => ({ ...prev, controlsVisible: true }));
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    armHideTimer(playing: boolean, delay: number = HIDE_DELAY_MS) {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (!playing) return;
      hideTimer.current = window.setTimeout(() => {
        setState((prev) => ({ ...prev, controlsVisible: false }));
      }, delay);
    },
    hideAfterPointerLeave() {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        setState((prev) =>
          prev.paused ? prev : { ...prev, controlsVisible: false },
        );
      }, HIDE_LEAVE_DELAY_MS);
    },
  };
};
