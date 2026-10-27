export const DEBRIEF_PAR_SCORE = 70;
export const DEBRIEF_DELAY_MS = 86_400_000;

/** ISO strings — these cross the wire inside CourseProgress. */
export type DebriefFacts = {
  doneAt: string | null;
  passed: boolean;
  lastFailedAt: string | null;
};

export type DebriefState =
  | { kind: 'not-done' }
  | { kind: 'waiting'; availableAt: string } // first 24h after done
  | { kind: 'open'; retake: boolean }
  | { kind: 'retake-waiting'; availableAt: string } // after a below-par attempt
  | { kind: 'passed' };

export function computeDebriefState(
  facts: DebriefFacts,
  now: Date,
): DebriefState {
  if (facts.passed) return { kind: 'passed' };
  if (facts.doneAt === null) return { kind: 'not-done' };

  const doneMs = Date.parse(facts.doneAt);
  const failedMs = facts.lastFailedAt ? Date.parse(facts.lastFailedAt) : null;

  if (failedMs === null) {
    const availableMs = doneMs + DEBRIEF_DELAY_MS;
    if (now.getTime() >= availableMs) return { kind: 'open', retake: false };
    return {
      kind: 'waiting',
      availableAt: new Date(availableMs).toISOString(),
    };
  }

  // The retake window runs from whichever is later: the first completion or
  // the most recent failed attempt (backfilled history can put a failure
  // before doneAt).
  const availableMs = Math.max(doneMs, failedMs) + DEBRIEF_DELAY_MS;
  if (now.getTime() >= availableMs) return { kind: 'open', retake: true };
  return {
    kind: 'retake-waiting',
    availableAt: new Date(availableMs).toISOString(),
  };
}

export function isPass(totalScore: number): boolean {
  return totalScore >= DEBRIEF_PAR_SCORE;
}

/** Ring badge: 'debrief' for open and retake-waiting, 'passed' for passed, else null. */
export function debriefBadge(state: DebriefState): 'debrief' | 'passed' | null {
  switch (state.kind) {
    case 'open':
    case 'retake-waiting':
      return 'debrief';
    case 'passed':
      return 'passed';
    case 'not-done':
    case 'waiting':
      return null;
  }
}
