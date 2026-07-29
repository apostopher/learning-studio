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
    staleTime: 5 * 60 * 1000,
  });
}
