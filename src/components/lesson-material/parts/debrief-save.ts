import type { AITest } from '#/ai/schemas';

export type DebriefSaveState = 'unsaved' | 'saving' | 'saved' | 'failed';

/** The save of one completed session — `debriefSaveAtom`. */
export type DebriefSaveRecord = {
  test: AITest;
  state: Exclude<DebriefSaveState, 'unsaved'>;
};

/**
 * Where this session's save stands. A record for any other session (a
 * previous attempt, another lesson) means this one is unsaved.
 */
export function debriefSaveState(
  record: { test: unknown; state: DebriefSaveRecord['state'] } | null,
  session: unknown,
): DebriefSaveState {
  if (record === null || record.test !== session) return 'unsaved';
  return record.state;
}

export type DebriefSaveOutcome = 'saved' | 'not-open' | 'failed';

/**
 * What a settled `useSaveResults` call means:
 * - saved: recorded.
 * - not-open: refused with 409 (the hook resolves null) — nothing recorded,
 *   the session is stale, and the status refetch is already asked for.
 * - failed: any other error — nothing recorded, and the pilot must be told
 *   and offered the same save again rather than left on a report that
 *   silently does not count.
 */
export function debriefSaveOutcome(
  settled: PromiseSettledResult<unknown>,
): DebriefSaveOutcome {
  if (settled.status === 'rejected') return 'failed';
  return settled.value === null ? 'not-open' : 'saved';
}
