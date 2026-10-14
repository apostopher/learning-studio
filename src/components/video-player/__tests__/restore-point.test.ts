import { describe, expect, it, vi } from 'vitest';
import {
  applyRestorePoint,
  captureRestorePoint,
  isLanguageSwitch,
  restorePointForSourceSwap,
} from '../restore-point';

describe('restore point', () => {
  it('pauses on capture so the playhead stops advancing while the swap is in flight, and remembers it was playing', () => {
    const pause = vi.fn();
    const point = captureRestorePoint({
      currentTime: 42.5,
      paused: false,
      pause,
    });
    expect(pause).toHaveBeenCalledOnce();
    expect(point).toEqual({ time: 42.5, resume: true });
  });

  it('does not resume a video that was already paused', () => {
    const point = captureRestorePoint({
      currentTime: 3,
      paused: true,
      pause: vi.fn(),
    });
    expect(point.resume).toBe(false);
  });

  it('seeks the new source to the captured time, clamped to its duration, and plays if it was playing', () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const video = { currentTime: 0, duration: 30, play };
    applyRestorePoint(video, { time: 42.5, resume: true });
    expect(video.currentTime).toBe(30);
    expect(play).toHaveBeenCalledOnce();
  });

  it('leaves a paused video paused', () => {
    const play = vi.fn();
    const video = { currentTime: 0, duration: Number.NaN, play };
    applyRestorePoint(video, { time: 12, resume: false });
    expect(video.currentTime).toBe(12);
    expect(play).not.toHaveBeenCalled();
  });
});

describe('isLanguageSwitch', () => {
  // The active Menu.Item fires onChange too. Capturing a restore point for
  // it pauses the video with no new `src` ever coming, and leaves a stale
  // `{time, resume: true}` that the NEXT loadedmetadata — a fatal-error
  // recovery reattachment — would apply, seeking and auto-playing where
  // recovery must never auto-play.
  it('is false when the chosen language is the one already playing', () => {
    expect(isLanguageSwitch('en', 'en')).toBe(false);
  });

  it('is true when the chosen language differs from the active one', () => {
    expect(isLanguageSwitch('fr-CA', 'en')).toBe(true);
  });

  it('is false when no active language is known — nothing to switch from', () => {
    expect(isLanguageSwitch('fr-CA', undefined)).toBe(false);
  });
});

/**
 * F3 (spec §3 row 1): the admin preview re-resolves its signed URL ~60s
 * before expiry. The new src re-attaches; with nothing pending, the outgoing
 * playhead has to become the restore point or the video restarts at 0:00.
 */
describe('restorePointForSourceSwap', () => {
  const playingAt42 = { currentTime: 42, paused: false };

  it('carries a playing video across a timer refresh and keeps it playing', () => {
    expect(
      restorePointForSourceSwap({
        languagePending: false,
        recoveryPending: false,
        outgoing: playingAt42,
      }),
    ).toEqual({ time: 42, resume: true });
  });

  it('keeps a paused video paused', () => {
    expect(
      restorePointForSourceSwap({
        languagePending: false,
        recoveryPending: false,
        outgoing: { currentTime: 7, paused: true },
      }),
    ).toEqual({ time: 7, resume: false });
  });

  it('leaves a pending language-switch restore point to win', () => {
    expect(
      restorePointForSourceSwap({
        languagePending: true,
        recoveryPending: false,
        outgoing: playingAt42,
      }),
    ).toBeNull();
  });

  it('leaves a pending recovery restore point to win (recovery never auto-plays)', () => {
    expect(
      restorePointForSourceSwap({
        languagePending: false,
        recoveryPending: true,
        outgoing: playingAt42,
      }),
    ).toBeNull();
  });
});
