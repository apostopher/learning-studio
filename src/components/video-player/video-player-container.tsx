import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useId, useRef } from 'react';
import { videoPlayerStateAtomFamily } from './atoms';
import { attachMedia } from './attach-media';
import { computeRecoveryDecision } from './compute-recovery-action';
import { useVideoPlayer } from './hooks';
import type { VideoPlayerActions, VideoPlayerProps } from './types';
import { VideoPlayer } from './video-player';

type ContainerProps = Omit<
  VideoPlayerProps,
  'videoRef' | 'rootRef' | 'state' | 'actions'
> & {
  playerId?: string;
  onEnded?: () => void;
  overlay?: React.ReactNode;
  /**
   * True when this specific video is known to carry no caption track at all.
   * Threaded straight into `VideoPlayerState.captionsUnavailable` — see that
   * field's comment — so `CaptionsButton` discloses the absence instead of
   * silently rendering the same "no button" state as a video that just
   * hasn't finished loading yet.
   */
  captionsUnavailable?: boolean;
  /**
   * Called to re-resolve this video's playback (fetch a fresh signed
   * URL/token) after a mid-playback source failure. Wired to the ready
   * state's `onRetry` from `#/components/lesson-main/types` — see that
   * field's comment for why this exists and why it is never timer-driven.
   */
  onSourceExpired?: () => void;
};

export const VideoPlayerContainer = ({
  playerId: providedId,
  onEnded,
  overlay,
  captionsUnavailable,
  onSourceExpired,
  ...rest
}: ContainerProps) => {
  const generatedId = useId();
  const playerId = providedId ?? generatedId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useAtomValue(videoPlayerStateAtomFamily(playerId));
  const setState = useSetAtom(videoPlayerStateAtomFamily(playerId));
  const { showControls, armHideTimer, hideAfterPointerLeave } = useVideoPlayer(
    playerId,
    videoRef,
    rootRef,
  );

  // The atom family is keyed only on `playerId`, so it has no way to receive
  // a per-video fact like "this one has no captions" at creation time — this
  // is the only place that gap is bridged. Nothing else in this container
  // (or `useVideoPlayer`) ever writes `captionsUnavailable`.
  useEffect(() => {
    if (captionsUnavailable === undefined) return;
    setState((prev) => ({ ...prev, captionsUnavailable }));
  }, [captionsUnavailable, setState]);

  // Held in a ref, like `onForbiddenRef` in the admin preview this was
  // extracted from: `onSourceExpired` traces back to an inline arrow
  // (`onRetryVideo` in lesson-main-wrapper.tsx) that is a new function
  // identity on every render of a component well above this one. Putting it
  // directly in the effect below's dependency list would tear down and
  // reattach hls.js — mid-playback — on every unrelated parent render.
  const onSourceExpiredRef = useRef(onSourceExpired);
  useEffect(() => {
    onSourceExpiredRef.current = onSourceExpired;
  }, [onSourceExpired]);

  // How many automatic recoveries this mount has already attempted for the
  // CURRENT source — see `compute-recovery-action.ts` for why this is
  // capped rather than unbounded. Reset to 0 the moment a reattachment
  // actually reaches `loadedmetadata` (proof it worked), and by a manual
  // Retry click, which always gets its own fresh budget.
  const recoveryAttemptsRef = useRef(0);
  // The playhead position to restore once a recovery reattachment lands.
  // Captured right before teardown (in the fatal-error handler below, and in
  // the manual retry action) — without this, re-running `attachMedia` drops
  // the learner back to 0:00, which on a platform whose completion gating
  // depends on watch coverage is worse than the error it was recovering
  // from. `null` means "nothing pending".
  const pendingRestoreTimeRef = useRef<number | null>(null);

  // Registered once, independent of `rest.src`: the video element itself
  // never unmounts across a reattachment (only its `src`/hls.js instance
  // does), and `loadedmetadata` fires again for every new source regardless
  // of when this listener was attached.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoadedMetadata = () => {
      // A source that got far enough to report metadata is playable —
      // proof the last recovery attempt (if any) worked. Reset the budget
      // so a LATER, unrelated failure gets its own full retry allowance
      // instead of inheriting whatever was left over from this one.
      recoveryAttemptsRef.current = 0;
      const target = pendingRestoreTimeRef.current;
      if (target === null) return;
      pendingRestoreTimeRef.current = null;
      // Restored here, not immediately on attach: the seekable range isn't
      // known until metadata has loaded, and assigning `currentTime` any
      // earlier is silently discarded by the media element.
      video.currentTime =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(target, video.duration)
          : target;
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', onLoadedMetadata);
  }, []);

  // Plain files are already handled by VideoPlayer's native `src` attribute
  // and don't need this. HLS sources (Mux is HLS-only) need hls.js — or
  // Safari's native support — attached imperatively via the ref; see
  // `attach-media.ts` for the Safari/hls.js/Mux-auth-rejection details this
  // preserves.
  //
  // A fatal auth rejection asks `computeRecoveryDecision` whether to retry
  // (re-resolve playback for a fresh signed URL/token — the "actual
  // failure" trigger the no-expiry-timer constraint requires, never
  // `expiresInSeconds`) or report a truthful terminal error: re-resolving
  // can only fix an EXPIRED token by minting a new one, not a REVOKED
  // signing key, which would reject again no matter how many times it's
  // re-fetched — the client cannot tell those apart, so recovery gets a
  // small fixed budget rather than spinning forever. Once a fresh `src` prop
  // arrives (on retry), this effect's own dependency on `rest.src` tears
  // down the stale hls.js instance and reattaches, and the native
  // `loadstart` handler in `useVideoPlayer` (below) clears `status: 'error'`
  // the moment that reattachment begins.
  useEffect(() => {
    const video = videoRef.current;
    const kind = rest.kind ?? 'file';
    if (!video || !rest.src || kind !== 'hls') return;
    return attachMedia(video, rest.src, kind, (fatal) => {
      if (!fatal) return;
      const decision = computeRecoveryDecision(recoveryAttemptsRef.current);
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: decision.message,
      }));
      if (decision.kind === 'retry') {
        recoveryAttemptsRef.current = decision.attempt;
        pendingRestoreTimeRef.current = video.currentTime;
        onSourceExpiredRef.current?.();
      }
      // Terminal: no further automatic attempt. The ErrorOverlay's Retry
      // button (actions.onRetry below) is the only way forward from here,
      // and it resets the budget for a genuinely new try.
    });
  }, [rest.src, rest.kind, setState]);

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
      (
        v as unknown as { webkitEnterFullscreen: () => void }
      ).webkitEnterFullscreen();
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
      // A fresh, user-initiated attempt always gets its own budget — this
      // is not part of the bounded automatic loop above.
      recoveryAttemptsRef.current = 0;
      const v = videoRef.current;
      if (v) pendingRestoreTimeRef.current = v.currentTime;
      // Re-resolve playback (a fresh signed URL/token): a plain reload of
      // the same, still-expired URL cannot recover either provider's
      // signed-URL expiry on its own — see `onSourceExpired`'s doc comment.
      // Harmless to call for a native media error that was never a
      // signed-URL issue at all; it just re-fetches playback data that was
      // going to stay cached otherwise.
      onSourceExpired?.();
      // `video.load()` only helps the 'file' path (a plain `src` reload).
      // For 'hls', hls.js — not the native element — owns the media; the
      // element has no `src` of its own to reload, and calling `load()`
      // directly on it can tear down hls.js's MediaSource attachment
      // instead of helping. The HLS path's recovery is entirely driven by
      // `onSourceExpired` yielding a new `src` prop, which the attachMedia
      // effect above reattaches on its own.
      if ((rest.kind ?? 'file') !== 'hls') v?.load();
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
      overlay={overlay}
    />
  );
};
