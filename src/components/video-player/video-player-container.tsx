import { useAtomValue } from 'jotai';
import { useEffect, useId, useRef } from 'react';
import { videoPlayerStateAtomFamily } from './atoms';
import { useVideoPlayer } from './hooks';
import type { VideoPlayerActions, VideoPlayerProps } from './types';
import { VideoPlayer } from './video-player';

type ContainerProps = Omit<
  VideoPlayerProps,
  'videoRef' | 'rootRef' | 'state' | 'actions'
> & {
  playerId?: string;
  onEnded?: () => void;
};

export const VideoPlayerContainer = ({
  playerId: providedId,
  onEnded,
  ...rest
}: ContainerProps) => {
  const generatedId = useId();
  const playerId = providedId ?? generatedId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useAtomValue(videoPlayerStateAtomFamily(playerId));
  const { showControls, armHideTimer, hideAfterPointerLeave } = useVideoPlayer(
    playerId,
    videoRef,
    rootRef,
  );

  const seekTo = (time: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(time)) return;
    v.currentTime = Math.max(0, Math.min(time, v.duration || time));
  };

  const setCaptions = (enabled: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      const tt = v.textTracks[i];
      tt.mode = enabled && i === 0 ? 'showing' : 'disabled';
    }
  };

  const toggleFullscreen = async () => {
    const root = rootRef.current;
    const v = videoRef.current;
    if (!root) return;
    if (document.fullscreenElement === root) {
      await document.exitFullscreen();
    } else if (root.requestFullscreen) {
      await root.requestFullscreen();
    } else if (v && 'webkitEnterFullscreen' in v) {
      (v as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onLeave = () => hideAfterPointerLeave();
    root.addEventListener('mouseleave', onLeave);
    return () => root.removeEventListener('mouseleave', onLeave);
  }, [hideAfterPointerLeave]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !onEnded) return;
    v.addEventListener('ended', onEnded);
    return () => v.removeEventListener('ended', onEnded);
  }, [onEnded]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode =
        state.captionsEnabled && i === 0 ? 'showing' : 'disabled';
    }
  }, [state.captionsEnabled]);

  const onKeyboardShortcut = (key: string) => {
    const v = videoRef.current;
    if (!v) return;
    showControls();
    armHideTimer(!state.paused);
    switch (key) {
      case ' ':
      case 'k':
      case 'K':
        if (state.paused) v.play();
        else v.pause();
        break;
      case 'ArrowLeft':
        seekTo(state.currentTime - 5);
        break;
      case 'ArrowRight':
        seekTo(state.currentTime + 5);
        break;
      case 'ArrowUp':
        v.muted = false;
        v.volume = Math.min(1, state.volume + 0.1);
        break;
      case 'ArrowDown':
        v.volume = Math.max(0, state.volume - 0.1);
        break;
      case 'm':
      case 'M':
        v.muted = !v.muted;
        break;
      case 'c':
      case 'C':
        if (state.hasCaptions) setCaptions(!state.captionsEnabled);
        break;
      case 'f':
      case 'F':
        void toggleFullscreen();
        break;
      case 'Home':
        seekTo(0);
        break;
      case 'End':
        seekTo(state.duration);
        break;
      default:
        if (/^[0-9]$/.test(key)) {
          const n = Number.parseInt(key, 10);
          seekTo(((state.duration || 0) * n) / 10);
        }
        break;
    }
  };

  const actions: VideoPlayerActions = {
    onPlay: () => videoRef.current?.play(),
    onPause: () => videoRef.current?.pause(),
    onSeek: seekTo,
    onSeekRelative: (delta) => seekTo(state.currentTime + delta),
    onVolumeChange: (volume) => {
      const v = videoRef.current;
      if (!v) return;
      v.muted = false;
      v.volume = Math.max(0, Math.min(1, volume));
    },
    onMuteToggle: () => {
      const v = videoRef.current;
      if (!v) return;
      v.muted = !v.muted;
    },
    onPlaybackRateChange: (rate) => {
      const v = videoRef.current;
      if (!v) return;
      v.playbackRate = rate;
    },
    onCaptionsToggle: () => {
      if (!state.hasCaptions) return;
      setCaptions(!state.captionsEnabled);
    },
    onFullscreenToggle: () => void toggleFullscreen(),
    onRetry: () => {
      videoRef.current?.load();
    },
    onPointerActivity: () => {
      showControls();
      armHideTimer(!state.paused);
    },
    onKeyboardShortcut,
  };

  return (
    <VideoPlayer
      {...rest}
      videoRef={videoRef}
      rootRef={rootRef}
      state={state}
      actions={actions}
    />
  );
};
