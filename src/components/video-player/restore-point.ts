export type RestorePoint = {
  time: number;
  /** Whether to resume playback once the new source is seekable. */
  resume: boolean;
};

/**
 * Taken the moment BEFORE a source swap is requested. The media element
 * resets `currentTime` to 0 synchronously when its `src` changes, so this
 * cannot be read afterwards — and the swap itself waits on a network round
 * trip, so the video is paused here to keep the number honest.
 */
export const captureRestorePoint = (video: {
  currentTime: number;
  paused: boolean;
  pause: () => void;
}): RestorePoint => {
  const resume = !video.paused;
  video.pause();
  return { time: video.currentTime, resume };
};

/**
 * Applied on the new source's `loadedmetadata` — the seekable range is not
 * known before that, and an earlier `currentTime` assignment is discarded.
 */
export const applyRestorePoint = (
  video: {
    currentTime: number;
    duration: number;
    play: () => Promise<void> | void;
  },
  point: RestorePoint,
): void => {
  video.currentTime =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(point.time, video.duration)
      : point.time;
  if (point.resume) void Promise.resolve(video.play()).catch(() => {});
};
