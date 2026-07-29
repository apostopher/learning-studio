import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const onboardingProgressSchema = z.object({
  status: z.enum([
    'not_started',
    'in_progress',
    'complete',
    'declined',
    'deleted',
  ]),
});

/** Whether the logged-in user has engaged with onboarding for this course at
 * all — a coarser question than useOnboardingChat's per-turn status, backed
 * by a read-only route with no model call, so it's safe to call on every
 * course-page render without spending anything. */
export function useOnboardingStatus(courseSlug: string) {
  return useQuery({
    queryKey: dataKeys.onboardingProgress(courseSlug),
    queryFn: async () => {
      const res = await fetch('/api/course/onboarding/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseSlug }),
      });
      if (!res.ok) {
        throw new Error(`Failed to load onboarding status (${res.status})`);
      }
      return onboardingProgressSchema.parse(await res.json()).status;
    },
    // This decision (auto-open the widget onto a session the learner may have
    // just declined/deleted/paused elsewhere) is consequential enough that
    // freshness beats cache reuse: staleTime: 0 plus refetchOnMount: 'always'
    // guarantee a real network round-trip on every mount, so a component that
    // gates its action on this query's fetch actually settling (see
    // course.$courseSlug.index.tsx) never acts on a value older than this
    // visit. The route itself is read-only and cheap (no model call, no
    // write), so there's no cost tradeoff being made here.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
