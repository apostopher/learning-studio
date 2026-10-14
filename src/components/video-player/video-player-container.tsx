import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useId, useRef } from 'react';
import {
  videoPlayerReattachAtomFamily,
  videoPlayerStateAtomFamily,
} from './atoms';
import { attachMedia } from './attach-media';
import { useVideoPlayer } from './hooks';
import {
  captionLoadFailedPatch,
  captionsSignature,
  fatalMediaOutcome,
  reattachKey,
  recoveryAttemptsOnPlaying,
  requestReattach,
} from './media-failure';
import {
  applyRestorePoint,
  captureRestorePoint,
  isLanguageSwitch,
  type RestorePoint,
  restorePointForSourceSwap,
} from './restore-point';
import type { VideoPlayerActions, VideoPlayerProps } from './types';
import { VideoPlayer } from './video-player';

/**
 * Runs `then` once `settled` (the caller's refetch, or nothing) settles, plus
 * one macrotask: TanStack Query notifies its observers on a `setTimeout(0)`
 * scheduled before the refetch promise resolves, so by then a FRESH url has
 * rendered and `reattachKey` sees it — and the settled request adds no
 * second attach of the old url. A rejected refetch still re-attaches: the
 * caller surfaces its own error, and the player must not stall either way.
 */
const afterSettled = (settled: unknown, then: () => void): void => {
  void Promise.resolve(settled)
    .catch(() => {})
    .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
    .then(then);
};

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
   *
   * Return the refetch's promise when there is one: the player waits for it
   * to settle and then re-attaches the source EVEN IF the url is unchanged
   * (a deterministic signer can hand back the same url — see
   * `ReattachRequest`). A plain `void` return re-attaches straight away.
   */
  onSourceExpired?: () => unknown;
  /**
   * The learner picked another language. The container pauses and records
   * the playhead BEFORE calling this (see `restore-point.ts`); the caller's
   * job is to make a new `src` arrive, on whose `loadedmetadata` the
   * playhead is restored and playback resumed.
   */
  onLanguageChange?: (code: string) => void;
  /**
   * Fires once when automatic recovery is exhausted; the player still shows
   * its own error overlay.
   */
  onPlaybackFailed?: (message: string) => void;
};

/**
 * The app's one video player: drop it on any page with a `src`. Optional
 * captions, a video-language menu, and callbacks for an expiring signed URL
 * (`onSourceExpired`) and for recovery giving up (`onPlaybackFailed`).
 *
 * It never records progress. Lesson progress, the debrief overlay and the
 * coverage notice belong to `LessonPlayerContainer`, which wraps this —
 * admin previews use this directly so an admin's viewing writes nothing.
 */
export const VideoPlayerContainer = ({
  playerId: providedId,
  onEnded,
  overlay,
  captionsUnavailable,
  onSourceExpired,
  onLanguageChange,
  onPlaybackFailed,
  ...rest
}: ContainerProps) => {
  const generatedId = useId();
  const playerId = providedId ?? generatedId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useAtomValue(videoPlayerStateAtomFamily(playerId));
  const setState = useSetAtom(videoPlayerStateAtomFamily(playerId));
  const reattach = useAtomValue(videoPlayerReattachAtomFamily(playerId));
  const setReattach = useSetAtom(videoPlayerReattachAtomFamily(playerId));
  // Changes only when a settled recovery must re-attach the src already
  // showing; a fresh src re-attaches through `rest.src` on its own.
  const attachKey = reattachKey(reattach, rest.src);
  const { showControls, armHideTimer, hideAfterPointerLeave } = useVideoPlayer(
    playerId,
    videoRef,
    rootRef,
  );

  // The atom family is keyed only on `playerId`, so it has no way to receive
  // a per-video fact like "this one has no captions" at creation time — this
  // is the only place that gap is bridged. Nothing else in this container
  // (or `useVideoPlayer`) ever writes `captionsUnavailable`.
  //
  // Keyed on the captions' CONTENT signature, not the array: callers rebuild
  // the array every render, and only a changed `src` (a fresh signed URL)
  // should reset a load error back to the prop value.
  const captionsKey = captionsSignature(rest.captions);
  // biome-ignore lint/correctness/useExhaustiveDependencies: captionsKey only re-triggers the reset; the body doesn't read it.
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      captionsUnavailable: captionsUnavailable ?? false,
    }));
  }, [captionsUnavailable, captionsKey, setState]);

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
  const onPlaybackFailedRef = useRef(onPlaybackFailed);
  useEffect(() => {
    onPlaybackFailedRef.current = onPlaybackFailed;
  }, [onPlaybackFailed]);

  // How many automatic recoveries this mount has already attempted — see
  // `compute-recovery-action.ts` for why this is capped rather than
  // unbounded. NOT reset on a reattachment reaching `loadedmetadata`: a
  // fragment-level 403 (same `fatal` + `response.code` shape as a
  // manifest-level one) can arrive well AFTER metadata has loaded, so
  // metadata proves nothing. It IS reset on the first `playing` after a
  // recovery re-attach (`recoveryAttemptsOnPlaying`) — media actually
  // playing again is the proof the recovery worked, and without the reset
  // an hour-long session would spend its whole budget across separate,
  // successful token renewals and then give up on the next one. A manual
  // Retry click (below) also resets it.
  const recoveryAttemptsRef = useRef(0);
  // Whether the source has been re-attached since the last fatal failure —
  // what lets the next `playing` count as a recovery that worked.
  const reattachedSinceFailureRef = useRef(false);
  // The playhead position to restore once a recovery reattachment lands.
  // Captured right before teardown (in the fatal-error handler below, and in
  // the manual retry action) — without this, re-running `attachMedia` drops
  // the learner back to 0:00, which on a platform whose completion gating
  // depends on watch coverage is worse than the error it was recovering
  // from. `null` means "nothing pending".
  const pendingRestoreTimeRef = useRef<number | null>(null);
  // A source swap's restore point: a language switch (captured before the
  // caller is asked for the new language) or a timer-driven url refresh
  // (captured from the outgoing media as the old source is torn down — see
  // `restorePointForSourceSwap`). Separate from `pendingRestoreTimeRef` (the
  // recovery path), which never resumes playback on its own — a recovery
  // from a fatal error should not auto-play, these should.
  const pendingSwapRestoreRef = useRef<RestorePoint | null>(null);

  // Registered once, independent of `rest.src`: the video element itself
  // never unmounts across a reattachment (only its `src`/hls.js instance
  // does), and `loadedmetadata` fires again for every new source regardless
  // of when this listener was attached.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoadedMetadata = () => {
      const langPoint = pendingSwapRestoreRef.current;
      if (langPoint) {
        pendingSwapRestoreRef.current = null;
        applyRestorePoint(video, langPoint);
        return;
      }
      // Deliberately does NOT reset `recoveryAttemptsRef` here — see that
      // ref's own comment for why reaching metadata is not sufficient proof
      // that a mid-playback failure won't recur.
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
    const onPlaying = () => {
      recoveryAttemptsRef.current = recoveryAttemptsOnPlaying(
        recoveryAttemptsRef.current,
        reattachedSinceFailureRef.current,
      );
      reattachedSinceFailureRef.current = false;
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('playing', onPlaying);
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('playing', onPlaying);
    };
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
  // small fixed budget rather than spinning forever. Once the recovery's
  // refetch settles, this effect re-runs either through `rest.src` (a fresh
  // url) or through `attachKey` (the SAME url came back — see
  // `ReattachRequest`), tears down the stale hls.js instance and reattaches;
  // the native `loadstart` handler in `useVideoPlayer` clears
  // `status: 'error'` the moment that reattachment begins.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attachKey is the re-attach trigger for an unchanged src; the body deliberately doesn't read it.
  useEffect(() => {
    const video = videoRef.current;
    const kind = rest.kind ?? 'file';
    const src = rest.src;
    if (!video || !src || kind !== 'hls') return;
    if (recoveryAttemptsRef.current > 0) {
      reattachedSinceFailureRef.current = true;
    }
    const teardown = attachMedia(video, src, kind, (fatal) => {
      if (!fatal) return;
      reattachedSinceFailureRef.current = false;
      const out = fatalMediaOutcome(recoveryAttemptsRef.current);
      setState((prev) => ({ ...prev, ...out.patch }));
      if (out.retry) {
        recoveryAttemptsRef.current = out.retry.attempt;
        pendingRestoreTimeRef.current = video.currentTime;
        afterSettled(onSourceExpiredRef.current?.(), () =>
          setReattach((prev) => requestReattach(prev, src)),
        );
      } else if (out.failedMessage !== null) {
        onPlaybackFailedRef.current?.(out.failedMessage);
      }
      // Terminal: no further automatic attempt. The ErrorOverlay's Retry
      // button (actions.onRetry below) is the only way forward from here,
      // and it resets the budget for a genuinely new try.
    });
    return () => {
      // Read before teardown: detaching hls.js resets the playhead. A swap
      // nobody captured for (the admin's timer refresh of a signed url)
      // would otherwise restart at 0:00, paused.
      const point = restorePointForSourceSwap({
        languagePending: pendingSwapRestoreRef.current !== null,
        recoveryPending: pendingRestoreTimeRef.current !== null,
        outgoing: video,
      });
      if (point) pendingSwapRestoreRef.current = point;
      teardown();
    };
  }, [rest.src, rest.kind, attachKey, setState, setReattach]);

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

  // Re-applied whenever the track LIST changes too, not only the flag: a
  // language switch (or a recovery reattachment) mounts a fresh <track>,
  // whose TextTrack starts `disabled` regardless of what the learner had
  // chosen — without this dependency captions that were on would silently
  // drop after every swap while the button still read "on".
  // biome-ignore lint/correctness/useExhaustiveDependencies: rest.captions intentionally re-triggers the mode reset when the <track> elements are replaced even though it isn't read in the body — the body reads the live textTracks list instead.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode =
        state.captionsEnabled && i === 0 ? 'showing' : 'disabled';
    }
  }, [state.captionsEnabled, captionsKey]);

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
      const settled = onSourceExpired?.();
      // Same identical-url trap as automatic recovery: re-attach once the
      // refetch settles, whether or not the url changed.
      const src = rest.src;
      if (src) {
        afterSettled(settled, () =>
          setReattach((prev) => requestReattach(prev, src)),
        );
      }
      // `video.load()` only helps the 'file' path (a plain `src` reload).
      // For 'hls', hls.js — not the native element — owns the media; the
      // element has no `src` of its own to reload, and calling `load()`
      // directly on it can tear down hls.js's MediaSource attachment
      // instead of helping. The HLS path's recovery is entirely driven by
      // `onSourceExpired` settling, after which the attachMedia effect
      // above reattaches (new `src`, or `attachKey` for the same one).
      if ((rest.kind ?? 'file') !== 'hls') v?.load();
    },
    onPointerActivity: () => {
      showControls();
      armHideTimer(!state.paused);
    },
    onKeyboardShortcut,
    onCaptionsError: () =>
      setState((prev) => ({ ...prev, ...captionLoadFailedPatch() })),
    onLanguageChange: onLanguageChange
      ? (code) => {
          // The active menu item fires this too. Capturing for it would
          // pause the video with no new `src` coming and leave a stale
          // resume-on-next-loadedmetadata — see `isLanguageSwitch`.
          if (!isLanguageSwitch(code, rest.activeLanguage)) return;
          const v = videoRef.current;
          if (v) pendingSwapRestoreRef.current = captureRestorePoint(v);
          onLanguageChange(code);
        }
      : undefined,
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
