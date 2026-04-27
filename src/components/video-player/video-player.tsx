import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DEFAULT_LABELS, PLAYBACK_RATES } from './labels';
import { BigPlayButton } from './parts/big-play-button';
import { CaptionsButton } from './parts/captions-button';
import { ErrorOverlay } from './parts/error-overlay';
import { FullscreenButton } from './parts/fullscreen-button';
import { PlayPauseButton } from './parts/play-pause-button';
import { PlaybackRateMenu } from './parts/playback-rate-menu';
import { Scrubber } from './parts/scrubber';
import { Spinner } from './parts/spinner';
import { TimeDisplay } from './parts/time-display';
import { VolumeControl } from './parts/volume-control';
import type { VideoPlayerProps } from './types';

export const VideoPlayer = ({
  src,
  videoRef,
  rootRef,
  tracks,
  state,
  actions,
  playbackRates = [...PLAYBACK_RATES],
  labels: labelOverrides,
  ...nativeRest
}: VideoPlayerProps) => {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const {
    paused = true,
    currentTime = 0,
    duration = 0,
    bufferedEnd = 0,
    volume = 1,
    muted = false,
    playbackRate = 1,
    captionsEnabled = false,
    hasCaptions = (tracks?.length ?? 0) > 0,
    fullscreen = false,
    status = 'idle',
    error,
    hasPlayedOnce = false,
    controlsVisible = true,
  } = state ?? {};
  const a = actions ?? {};
  const reduced = useReducedMotion();

  const onSurfaceClick = paused ? a.onPlay : a.onPause;
  const surfaceLabel = paused ? labels.play : labels.pause;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.matches?.(
        '[role="slider"], input, textarea, [role="menu"], [role="menu"] *',
      )
    ) {
      return;
    }
    a.onKeyboardShortcut?.(event.key);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: keep div root — section's UA styles add unwanted block flow; aria role + tabIndex give the same semantics with full layout control
    <div
      ref={rootRef}
      role="region"
      aria-label={labels.player}
      className="video-player"
      data-controls-visible={controlsVisible}
      data-status={status}
      onKeyDown={handleKeyDown}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: root is focusable so keyboard shortcuts (Space/arrows/F/M/C) work even before any control inside has focus
      tabIndex={0}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer activity wakes the auto-hide controls; the inner <button class="vp-surface"> handles real click semantics */}
      <div
        className="vp-video-area"
        onMouseMove={a.onPointerActivity}
        onPointerDown={a.onPointerActivity}
      >
        <video ref={videoRef} src={src} playsInline {...nativeRest}>
          {tracks?.map((t) => (
            <track key={`${t.src}-${t.srcLang ?? ''}`} {...t} />
          ))}
        </video>

        <button
          type="button"
          tabIndex={-1}
          onClick={onSurfaceClick}
          disabled={!onSurfaceClick}
          aria-label={surfaceLabel}
          className="vp-surface"
        />

        <AnimatePresence>
          {!hasPlayedOnce && status !== 'error' && status !== 'loading' ? (
            <BigPlayButton
              key="big-play"
              label={labels.play}
              onClick={a.onPlay}
              disabled={!a.onPlay}
            />
          ) : null}
        </AnimatePresence>

        {status === 'loading' || status === 'buffering' ? (
          <Spinner
            label={status === 'loading' ? labels.loading : labels.buffering}
          />
        ) : null}

        {status === 'error' ? (
          <ErrorOverlay
            message={error}
            defaultMessage={labels.error}
            retryLabel={labels.retry}
            onRetry={a.onRetry}
          />
        ) : null}

        <span aria-live="polite" className="vp-sr-only" />
      </div>

      <motion.div
        className="vp-controls"
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={reduced ? undefined : { opacity: 1, y: 0 }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: 'spring', bounce: 0.1, visualDuration: 0.25 }
        }
      >
        <Scrubber
          currentTime={currentTime}
          duration={duration}
          bufferedEnd={bufferedEnd}
          seekLabel={labels.seek}
          onSeek={a.onSeek}
        />
        <div className="vp-controls-row">
          <PlayPauseButton
            paused={paused}
            playLabel={labels.play}
            pauseLabel={labels.pause}
            onPlay={a.onPlay}
            onPause={a.onPause}
          />
          <TimeDisplay currentTime={currentTime} duration={duration} />
          <VolumeControl
            volume={volume}
            muted={muted}
            muteLabel={labels.mute}
            unmuteLabel={labels.unmute}
            volumeLabel={labels.volume}
            onMuteToggle={a.onMuteToggle}
            onVolumeChange={a.onVolumeChange}
          />
          <span style={{ flex: 1 }} />
          {a.onPlaybackRateChange ? (
            <PlaybackRateMenu
              rate={playbackRate}
              rates={playbackRates}
              label={labels.playbackRate}
              onChange={a.onPlaybackRateChange}
            />
          ) : null}
          {hasCaptions && a.onCaptionsToggle ? (
            <CaptionsButton
              enabled={captionsEnabled}
              onLabel={labels.captionsOn}
              offLabel={labels.captionsOff}
              onToggle={a.onCaptionsToggle}
            />
          ) : null}
          {a.onFullscreenToggle ? (
            <FullscreenButton
              isFullscreen={fullscreen}
              enterLabel={labels.fullscreenEnter}
              exitLabel={labels.fullscreenExit}
              onToggle={a.onFullscreenToggle}
            />
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};
