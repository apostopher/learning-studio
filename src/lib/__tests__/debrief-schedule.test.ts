import { describe, expect, it } from 'vitest';
import {
  computeDebriefState,
  type DebriefFacts,
  debriefBadge,
  isPass,
  msUntil,
} from '#/lib/debrief-schedule';

const now = new Date('2026-10-27T12:00:00Z');
const hoursAgo = (h: number) =>
  new Date(now.getTime() - h * 3_600_000).toISOString();

const facts = (overrides: Partial<DebriefFacts>): DebriefFacts => ({
  doneAt: null,
  passed: false,
  lastFailedAt: null,
  ...overrides,
});

describe('computeDebriefState', () => {
  it('is passed when the lesson is passed, even with no doneAt', () => {
    expect(computeDebriefState(facts({ passed: true }), now)).toEqual({
      kind: 'passed',
    });
  });

  it('is not-done when there is no doneAt and it is not passed', () => {
    expect(computeDebriefState(facts({ doneAt: null }), now)).toEqual({
      kind: 'not-done',
    });
  });

  it('is waiting for the first 24h after done', () => {
    expect(computeDebriefState(facts({ doneAt: hoursAgo(1) }), now)).toEqual({
      kind: 'waiting',
      availableAt: '2026-10-28T11:00:00.000Z',
    });
  });

  it('is open exactly 24h after done (boundary inclusive)', () => {
    expect(computeDebriefState(facts({ doneAt: hoursAgo(24) }), now)).toEqual({
      kind: 'open',
      retake: false,
    });
  });

  it('is retake-waiting for 24h after a below-par attempt', () => {
    expect(
      computeDebriefState(
        facts({ doneAt: hoursAgo(48), lastFailedAt: hoursAgo(2) }),
        now,
      ),
    ).toEqual({
      kind: 'retake-waiting',
      availableAt: '2026-10-28T10:00:00.000Z',
    });
  });

  it('is open for retake once 24h have passed since the failed attempt', () => {
    expect(
      computeDebriefState(
        facts({ doneAt: hoursAgo(48), lastFailedAt: hoursAgo(25) }),
        now,
      ),
    ).toEqual({ kind: 'open', retake: true });
  });

  it('uses the later of doneAt and lastFailedAt when history is backfilled', () => {
    // lastFailedAt is earlier than doneAt: the schedule runs from doneAt.
    expect(
      computeDebriefState(
        facts({ doneAt: hoursAgo(1), lastFailedAt: hoursAgo(100) }),
        now,
      ),
    ).toEqual({
      kind: 'retake-waiting',
      availableAt: new Date(Date.parse(hoursAgo(1)) + 86_400_000).toISOString(),
    });
  });
});

describe('isPass', () => {
  it('passes at par (70) and above', () => {
    expect(isPass(70)).toBe(true);
    expect(isPass(100)).toBe(true);
  });

  it('fails below par', () => {
    expect(isPass(69)).toBe(false);
  });
});

describe('debriefBadge', () => {
  it('shows debrief for open and retake-waiting', () => {
    expect(debriefBadge({ kind: 'open', retake: false })).toBe('debrief');
    expect(debriefBadge({ kind: 'open', retake: true })).toBe('debrief');
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
