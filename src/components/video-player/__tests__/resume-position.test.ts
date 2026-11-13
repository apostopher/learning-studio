import { describe, expect, it } from 'vitest';
import {
  computePositionSave,
  initialPositionSaveState,
  positionToFlush,
  resumeSeek,
  resumeTargetFrom,
} from '../resume-position';

describe('resumeTargetFrom', () => {
  it('is undefined while the saved position is still loading', () => {
    expect(resumeTargetFrom(undefined)).toBeUndefined();
  });

  it('is null for a video never started, or left in its first second', () => {
    expect(resumeTargetFrom(null)).toBeNull();
    expect(resumeTargetFrom({ seconds: 0.4, duration: 600 })).toBeNull();
  });

  it('resumes mid-video where the learner left', () => {
    expect(resumeTargetFrom({ seconds: 312.5, duration: 600 })).toEqual({
      kind: 'time',
      seconds: 312.5,
    });
  });

  it('parks a finished video at the end, so the bar reads full', () => {
    expect(resumeTargetFrom({ seconds: 600, duration: 600 })).toEqual({
      kind: 'end',
    });
    // `timeupdate`'s last reading trails `duration` by up to a tick.
    expect(resumeTargetFrom({ seconds: 599.6, duration: 600 })).toEqual({
      kind: 'end',
    });
  });
});

describe('resumeSeek', () => {
  const ready = { readyState: 1, paused: true, currentTime: 0, duration: 600 };

  it('waits while the position is loading or metadata is not in', () => {
    expect(resumeSeek({ ...ready, target: undefined })).toEqual({
      settle: false,
      seekTo: null,
    });
    expect(
      resumeSeek({ ...ready, readyState: 0, target: { kind: 'end' } }),
    ).toEqual({ settle: false, seekTo: null });
  });

  it('seeks to the saved time', () => {
    expect(
      resumeSeek({ ...ready, target: { kind: 'time', seconds: 312.5 } }),
    ).toEqual({ settle: true, seekTo: 312.5 });
  });

  it("seeks a finished video to this media's own end", () => {
    expect(resumeSeek({ ...ready, target: { kind: 'end' } })).toEqual({
      settle: true,
      seekTo: 600,
    });
  });

  it('never seeks past the end of a re-encoded, shorter video', () => {
    expect(
      resumeSeek({
        ...ready,
        duration: 300,
        target: { kind: 'time', seconds: 312.5 },
      }),
    ).toEqual({ settle: true, seekTo: 300 });
  });

  it('settles without seeking when there is nothing saved', () => {
    expect(resumeSeek({ ...ready, target: null })).toEqual({
      settle: true,
      seekTo: null,
    });
  });

  it('leaves alone a learner who already pressed play or moved the playhead', () => {
    const target = { kind: 'time', seconds: 312.5 } as const;
    expect(resumeSeek({ ...ready, paused: false, target })).toEqual({
      settle: true,
      seekTo: null,
    });
    expect(resumeSeek({ ...ready, currentTime: 40, target })).toEqual({
      settle: true,
      seekTo: null,
    });
  });
});

describe('computePositionSave', () => {
  const tick = (
    prev: ReturnType<typeof computePositionSave>['state'],
    input: Partial<Parameters<typeof computePositionSave>[1]>,
  ) =>
    computePositionSave(prev, {
      paused: true,
      currentTime: 0,
      duration: 600,
      now: 0,
      ...input,
    });

  it('saves nothing for a video the learner never played', () => {
    // Includes the resume seek itself: it moves the playhead while paused.
    const r = tick(initialPositionSaveState, { currentTime: 312.5 });
    expect(r.save).toBeNull();
  });

  it('saves when the learner pauses', () => {
    let r = tick(initialPositionSaveState, {
      paused: false,
      currentTime: 10,
      now: 0,
    });
    r = tick(r.state, { paused: true, currentTime: 42, now: 1_000 });
    expect(r.save).toEqual({ seconds: 42, duration: 600 });
  });

  it('saves every 10 seconds of playback, not on every tick', () => {
    let r = tick(initialPositionSaveState, {
      paused: false,
      currentTime: 0,
      now: 0,
    });
    expect(r.save).toBeNull();
    r = tick(r.state, { paused: false, currentTime: 5, now: 5_000 });
    expect(r.save).toBeNull();
    r = tick(r.state, { paused: false, currentTime: 10, now: 10_000 });
    expect(r.save).toEqual({ seconds: 10, duration: 600 });
    r = tick(r.state, { paused: false, currentTime: 12, now: 12_000 });
    expect(r.save).toBeNull();
  });

  it('saves the end when the video finishes, and the rewatch after it', () => {
    let r = tick(initialPositionSaveState, {
      paused: false,
      currentTime: 599,
      now: 0,
    });
    r = tick(r.state, { paused: true, currentTime: 600, now: 1_000 });
    expect(r.save).toEqual({ seconds: 600, duration: 600 });
    // Play from the end restarts at 0:00; the next pause follows the new watch.
    r = tick(r.state, { paused: false, currentTime: 0, now: 2_000 });
    r = tick(r.state, { paused: true, currentTime: 30, now: 3_000 });
    expect(r.save).toEqual({ seconds: 30, duration: 600 });
  });

  it('saves nothing before the duration is known', () => {
    let r = tick(initialPositionSaveState, {
      paused: false,
      duration: 0,
      now: 0,
    });
    r = tick(r.state, {
      paused: true,
      duration: 0,
      currentTime: 5,
      now: 1_000,
    });
    expect(r.save).toBeNull();
  });
});

describe('positionToFlush', () => {
  it('flushes an unsaved position when the learner leaves', () => {
    let r = computePositionSave(initialPositionSaveState, {
      paused: false,
      currentTime: 10,
      duration: 600,
      now: 0,
    });
    r = computePositionSave(r.state, {
      paused: false,
      currentTime: 14,
      duration: 600,
      now: 4_000,
    });
    expect(
      positionToFlush(r.state, { currentTime: 14, duration: 600 }),
    ).toEqual({
      seconds: 14,
      duration: 600,
    });
  });

  it('flushes nothing for a video never played this visit', () => {
    expect(
      positionToFlush(initialPositionSaveState, {
        currentTime: 312,
        duration: 600,
      }),
    ).toBeNull();
  });

  it('flushes nothing already saved', () => {
    let r = computePositionSave(initialPositionSaveState, {
      paused: false,
      currentTime: 10,
      duration: 600,
      now: 0,
    });
    r = computePositionSave(r.state, {
      paused: true,
      currentTime: 42,
      duration: 600,
      now: 1_000,
    });
    expect(
      positionToFlush(r.state, { currentTime: 42, duration: 600 }),
    ).toBeNull();
  });
});
