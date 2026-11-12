import { describe, expect, it } from 'vitest';
import {
  computeDebriefState,
  DEBRIEF_DELAY_LABEL,
  DEBRIEF_DELAY_MS,
  DEBRIEF_RETAKE_DELAY_MS,
  type DebriefFacts,
  debriefBadge,
  debriefClockStart,
  formatDebriefDelay,
  msUntil,
  parseDebriefDelayMinutes,
} from '#/lib/debrief-schedule';

const now = new Date('2026-10-27T12:00:00Z');
const hoursAgo = (h: number) =>
  new Date(now.getTime() - h * 3_600_000).toISOString();

const facts = (overrides: Partial<DebriefFacts>): DebriefFacts => ({
  clockStartAt: null,
  passed: false,
  lastFinishedAt: null,
  hasOpenAttempt: false,
  mastery: null,
  ...overrides,
});

describe('computeDebriefState', () => {
  it('is passed when the lesson is passed, even with no doneAt', () => {
    expect(computeDebriefState(facts({ passed: true }), now)).toEqual({
      kind: 'passed',
    });
  });

  it('is not-done when the clock has not started and it is not passed', () => {
    expect(computeDebriefState(facts({ clockStartAt: null }), now)).toEqual({
      kind: 'not-done',
    });
  });

  it('is waiting for the first 12h after the clock starts', () => {
    expect(
      computeDebriefState(facts({ clockStartAt: hoursAgo(1) }), now),
    ).toEqual({
      kind: 'waiting',
      availableAt: '2026-10-27T23:00:00.000Z',
    });
  });

  it('is still waiting just inside 12h', () => {
    expect(
      computeDebriefState(facts({ clockStartAt: hoursAgo(11.99) }), now).kind,
    ).toBe('waiting');
  });

  it('is open exactly 12h after the clock starts (boundary inclusive)', () => {
    expect(
      computeDebriefState(facts({ clockStartAt: hoursAgo(12) }), now),
    ).toEqual({ kind: 'open', retake: false, resume: false });
  });

  it('is retake-waiting for 6h after the last finished attempt', () => {
    expect(
      computeDebriefState(
        facts({ clockStartAt: hoursAgo(48), lastFinishedAt: hoursAgo(2) }),
        now,
      ),
    ).toEqual({
      kind: 'retake-waiting',
      availableAt: '2026-10-27T16:00:00.000Z',
    });
  });

  it('is open for retake exactly 6h after the last finished attempt', () => {
    expect(
      computeDebriefState(
        facts({ clockStartAt: hoursAgo(48), lastFinishedAt: hoursAgo(6) }),
        now,
      ),
    ).toEqual({ kind: 'open', retake: true, resume: false });
  });

  it('retake delay is a fixed 6 hours', () => {
    expect(DEBRIEF_RETAKE_DELAY_MS).toBe(6 * 3_600_000);
  });

  it('gates a retake on lastFinishedAt even when the clock start is later', () => {
    expect(
      computeDebriefState(
        facts({ clockStartAt: hoursAgo(1), lastFinishedAt: hoursAgo(100) }),
        now,
      ),
    ).toEqual({ kind: 'open', retake: true, resume: false });
  });

  it('an open attempt resumes regardless of the clock', () => {
    expect(
      computeDebriefState(
        facts({
          clockStartAt: hoursAgo(1),
          lastFinishedAt: hoursAgo(1 / 60),
          hasOpenAttempt: true,
        }),
        now,
      ),
    ).toEqual({ kind: 'open', retake: true, resume: true });
    expect(computeDebriefState(facts({ hasOpenAttempt: true }), now)).toEqual({
      kind: 'open',
      retake: false,
      resume: true,
    });
  });

  it('passed beats an open attempt', () => {
    expect(
      computeDebriefState(facts({ passed: true, hasOpenAttempt: true }), now),
    ).toEqual({ kind: 'passed' });
  });
});

describe('the debrief delay', () => {
  it('is 12 hours by default', () => {
    expect(DEBRIEF_DELAY_MS).toBe(12 * 3_600_000);
    expect(DEBRIEF_DELAY_LABEL).toBe('12 hours');
  });

  it('reads VITE_DEBRIEF_DELAY_MINUTES as minutes', () => {
    expect(parseDebriefDelayMinutes('1')).toBe(1);
    expect(parseDebriefDelayMinutes('0.5')).toBe(0.5);
    expect(parseDebriefDelayMinutes(90)).toBe(90);
  });

  it('falls back to 12 hours when unset or unusable, never to zero', () => {
    for (const raw of [undefined, null, '', 'abc', '0', '-5', 'Infinity']) {
      expect(parseDebriefDelayMinutes(raw)).toBe(720);
    }
  });

  it('is labelled in hours when whole, else minutes', () => {
    expect(formatDebriefDelay(720)).toBe('12 hours');
    expect(formatDebriefDelay(60)).toBe('1 hour');
    expect(formatDebriefDelay(1)).toBe('1 minute');
    expect(formatDebriefDelay(90)).toBe('90 minutes');
  });
});

describe('debriefClockStart', () => {
  const video = '2026-10-27T08:00:00.000Z';
  const done = '2026-10-27T10:00:00.000Z';

  it('on a video lesson, starts only when the video is fully watched', () => {
    expect(
      debriefClockStart({
        hasVideo: true,
        videoWatchedAt: video,
        doneAt: done,
      }),
    ).toBe(video);
    expect(
      debriefClockStart({
        hasVideo: true,
        videoWatchedAt: video,
        doneAt: null,
      }),
    ).toBe(video);
  });

  it('on a video lesson, a lesson done without the video does not start it', () => {
    // A lesson that does not require the video can be done without it; the
    // debrief still waits for the full watch.
    expect(
      debriefClockStart({ hasVideo: true, videoWatchedAt: null, doneAt: done }),
    ).toBeNull();
  });

  it('on a lesson with no video, starts when the lesson is done', () => {
    expect(
      debriefClockStart({
        hasVideo: false,
        videoWatchedAt: null,
        doneAt: done,
      }),
    ).toBe(done);
    expect(
      debriefClockStart({
        hasVideo: false,
        videoWatchedAt: null,
        doneAt: null,
      }),
    ).toBeNull();
  });
});

describe('debriefBadge', () => {
  it('shows debrief for open and retake-waiting', () => {
    expect(debriefBadge({ kind: 'open', retake: false, resume: false })).toBe(
      'debrief',
    );
    expect(debriefBadge({ kind: 'open', retake: true, resume: false })).toBe(
      'debrief',
    );
    expect(
      debriefBadge({ kind: 'retake-waiting', availableAt: hoursAgo(-1) }),
    ).toBe('debrief');
  });

  it('shows passed for passed', () => {
    expect(debriefBadge({ kind: 'passed' })).toBe('passed');
  });

  it('shows nothing for not-done and waiting', () => {
    expect(debriefBadge({ kind: 'not-done' })).toBeNull();
    expect(
      debriefBadge({ kind: 'waiting', availableAt: hoursAgo(-1) }),
    ).toBeNull();
  });
});

describe('msUntil', () => {
  it('is the milliseconds from now to the instant', () => {
    expect(msUntil('2026-10-27T12:00:05Z', now)).toBe(5_000);
  });

  it('is 0 for an instant already past, so a refetch fires at once', () => {
    expect(msUntil(hoursAgo(1), now)).toBe(0);
  });

  it("is clamped to setTimeout's ceiling, which otherwise fires immediately", () => {
    // setTimeout treats any delay above 2^31-1 ms (~24.8 days) as 0.
    expect(msUntil('2027-06-01T00:00:00Z', now)).toBe(2_147_483_647);
  });
});
