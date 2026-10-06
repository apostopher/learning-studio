// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  callEndedLabel,
  callErrorMessage,
  formatCallDuration,
  formatCountdown,
  secondsUntil,
  videoButtonLabel,
} from '#/lib/video-call-copy';

describe('formatCountdown', () => {
  it('renders mm:ss, rounding up and never negative', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(61.2)).toBe('01:02');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('formatCallDuration', () => {
  it('uses seconds under a minute, rounded minutes above', () => {
    expect(formatCallDuration(0)).toBe('1 sec');
    expect(formatCallDuration(45)).toBe('45 sec');
    expect(formatCallDuration(90)).toBe('2 min');
    expect(formatCallDuration(600)).toBe('10 min');
  });
});

describe('callEndedLabel', () => {
  it('names the time limit, else the duration', () => {
    expect(callEndedLabel(600, 'time_limit')).toBe(
      'Video call ended · time limit reached',
    );
    expect(callEndedLabel(480, 'user')).toBe('Video call ended · 8 min');
    expect(callEndedLabel(null, null)).toBe('Video call ended');
  });
});

describe('secondsUntil', () => {
  it('counts down to an ISO instant', () => {
    expect(
      secondsUntil('2026-10-06T12:10:00.000Z', Date.parse('2026-10-06T12:09:00Z')),
    ).toBe(60);
  });
});

describe('videoButtonLabel', () => {
  it('states the reason and what unlocks it when unavailable', () => {
    expect(
      videoButtonLabel({
        status: 'unavailable',
        reason: 'daily_limit',
        resetsAt: '2026-10-07T00:00:00.000Z',
      }),
    ).toBe(
      "Video call unavailable. You've used today's 30 minutes. Resets at 00:00 UTC.",
    );
    expect(
      videoButtonLabel({ status: 'unavailable', reason: 'already_active' }),
    ).toBe("Video call unavailable. You're already on a call in another tab.");
    expect(
      videoButtonLabel({ status: 'unavailable', reason: 'not_configured' }),
    ).toBe("Video call unavailable. Video calls aren't set up on this server yet.");
  });

  it('labels the other states', () => {
    expect(videoButtonLabel({ status: 'available' })).toBe(
      'Start a video call with Viper7',
    );
    expect(videoButtonLabel({ status: 'loading' })).toBe(
      'Checking video call availability…',
    );
    expect(videoButtonLabel({ status: 'in-call' })).toBe(
      'Video call in progress',
    );
  });
});

describe('callErrorMessage', () => {
  it('tells the learner how to allow the microphone', () => {
    expect(callErrorMessage('mic_denied', null)).toBe(
      "Viper needs your microphone for a video call. Allow microphone access in your browser's site settings, then try again.",
    );
  });

  it('reuses the unavailable wording for limit errors', () => {
    expect(callErrorMessage('daily_limit', '2026-10-07T00:00:00.000Z')).toBe(
      "You've used today's 30 minutes. Resets at 00:00 UTC.",
    );
  });
});
