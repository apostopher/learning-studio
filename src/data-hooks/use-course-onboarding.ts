import { useQuery } from '@tanstack/react-query';
import { type OnboardingQuestions, OnboardingQuestionsSchema } from '#/types';
import { dataKeys } from './keys';

/** A course's onboarding question set: ordered categories, each with ordered questions. */
export function useCourseOnboarding(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseOnboarding(courseId),
    queryFn: async (): Promise<OnboardingQuestions> => {
      const res = await fetch(`/api/admin/courses/${courseId}/onboarding`);
      if (!res.ok) {
        throw new Error(`Failed to load onboarding (${res.status})`);
      }
      return OnboardingQuestionsSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}
