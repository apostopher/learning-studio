import type { DebriefState } from '#/lib/debrief-schedule';

/**
 * The 409 the debrief start route answers for a debrief that exists but is
 * not open now: not done, inside the first 12h (`waiting`), inside the 6h
 * after a finished attempt (`retake-waiting`), or passed. `availableAt` — an
 * ISO instant — only when there is a time to name: `waiting` and
 * `retake-waiting`. An open attempt is always `open` (resume), never this.
 */
export function debriefNotOpen(state: DebriefState): Response {
  return Response.json(
    {
      error: 'not-open',
      ...('availableAt' in state ? { availableAt: state.availableAt } : {}),
    },
    { status: 409 },
  );
}
