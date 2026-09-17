import { describe, expect, it, vi } from 'vitest';
import { applyRestorePoint, captureRestorePoint } from '../restore-point';

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
