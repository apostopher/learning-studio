import type { DebriefState } from '#/lib/debrief-schedule';

/**
 * The 409 `generate` and `save-results` answer for a debrief that exists but
 * is not open now (not done, inside the first 24h, waiting to retake, or
 * passed). `availableAt` — an ISO instant — only when there is a time to name:
 * `waiting` and `retake-waiting`.
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
