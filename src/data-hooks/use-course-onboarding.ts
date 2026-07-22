import { useQuery } from '@tanstack/react-query';
import { type OnboardingQuestion, OnboardingQuestionsSchema } from '#/types';
import { dataKeys } from './keys';

/** A course's onboarding questions (ordered). */
export function useCourseOnboarding(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseOnboarding(courseId),
    queryFn: async (): Promise<OnboardingQuestion[]> => {
      const res = await fetch(`/api/admin/courses/${courseId}/onboarding`);
      if (!res.ok) {
        throw new Error(`Failed to load onboarding (${res.status})`);
      }
      return OnboardingQuestionsSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}
