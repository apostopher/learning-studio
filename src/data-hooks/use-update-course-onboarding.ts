import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type OnboardingQuestion, OnboardingQuestionsSchema } from '#/types';
import { dataKeys } from './keys';

/** Replace a course's onboarding questions, then refetch. */
export function useUpdateCourseOnboarding(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      questions: OnboardingQuestion[],
    ): Promise<OnboardingQuestion[]> => {
      const res = await fetch(`/api/admin/courses/${courseId}/onboarding`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questions }),
      });
      if (!res.ok) throw new Error(`Failed to save onboarding (${res.status})`);
      return OnboardingQuestionsSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseOnboarding(courseId),
      });
    },
  });
}
