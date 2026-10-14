export type RestorePoint = {
  time: number;
  /** Whether to resume playback once the new source is seekable. */
  resume: boolean;
};

/**
 * Whether choosing `next` from the language menu is a real switch. The menu
 * fires for the active item too, and a restore point captured for a
 * non-switch pauses the video with no new source ever arriving, then gets
 * applied — seek AND auto-play — to whatever `loadedmetadata` comes next,
 * which may be a fatal-error recovery reattachment that must never
 * auto-play. Unknown `active` counts as no switch: there is nothing to
 * carry a playhead across from.
 */
export const isLanguageSwitch = (
  next: string,
  active: string | undefined,
): boolean => active !== undefined && next !== active;

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

/**
 * The restore point for a source swap nobody asked to restore — the admin
 * preview's timer re-resolving its signed URL shortly before expiry. Read
 * from the OUTGOING media just before it is torn down: without it the new
 * url starts at 0:00, paused. A pending language switch or recovery already
 * owns the restore and wins (`null`): recovery deliberately never
 * auto-plays, and a language switch already captured the right point.
 */
export const restorePointForSourceSwap = ({
  languagePending,
  recoveryPending,
  outgoing,
}: {
  languagePending: boolean;
  recoveryPending: boolean;
  outgoing: { currentTime: number; paused: boolean };
}): RestorePoint | null =>
  languagePending || recoveryPending
    ? null
    : { time: outgoing.currentTime, resume: !outgoing.paused };
