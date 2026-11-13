import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { useSaveVideoPosition } from '#/data-hooks/use-save-video-position';
import type { LessonRef } from '#/lib/lesson-ref';
import { videoPlayerStateAtomFamily } from './atoms';
import {
  computePositionSave,
  initialPositionSaveState,
  positionToFlush,
  type SavedPosition,
} from './resume-position';

/**
 * Saves where the learner is in the video, so the next visit resumes there:
 * on pause (including reaching the end), every 10s while playing, and once
 * more as they leave (navigating away, or the tab going hidden). The
 * decisions are the pure `computePositionSave`/`positionToFlush`; this only
 * wires them to the player state and the page lifecycle.
 *
 * One instance per lesson: mount it through `ResumePositionSaverContainer`,
 * keyed by lesson, with a per-lesson `playerId` (see `LessonPlayerContainer`).
 * Its refs then never carry one lesson's playhead into another, and the
 * flush on unmount reads the lesson being left.
 */
export function useResumePositionSaver(
  playerId: string,
  { courseSlug, lessonSlug }: LessonRef,
): void {
  const { paused, currentTime, duration } = useAtomValue(
    videoPlayerStateAtomFamily(playerId),
  );
  const save = useSaveVideoPosition();
  const saveRef = useRef(save);
  saveRef.current = save;
  const stateRef = useRef(initialPositionSaveState);
  const latestRef = useRef({ currentTime, duration });
  latestRef.current = { currentTime, duration };

  useEffect(() => {
    const result = computePositionSave(stateRef.current, {
      paused,
      currentTime,
      duration,
      now: Date.now(),
    });
    stateRef.current = result.state;
    if (result.save) {
      saveRef.current.mutate({ courseSlug, lessonSlug, ...result.save });
    }
  }, [paused, currentTime, duration, courseSlug, lessonSlug]);

  useEffect(() => {
    const flush = () => {
      const position: SavedPosition | null = positionToFlush(
        stateRef.current,
        latestRef.current,
      );
      if (!position) return;
      stateRef.current = {
        ...stateRef.current,
        lastSavedSeconds: position.seconds,
      };
      saveRef.current.mutate({ courseSlug, lessonSlug, ...position });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [courseSlug, lessonSlug]);
}
