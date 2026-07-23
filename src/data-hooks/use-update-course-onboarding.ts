import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type OnboardingQuestion, OnboardingQuestionsSchema } from '#/types';
import { dataKeys } from './keys';
import { saveJson } from './save-json';

interface UpdateOnboardingVars {
  questions: OnboardingQuestion[];
  /** Save-on-close: prefer sendBeacon and don't await a response. */
  fireAndForget?: boolean;
}

/**
 * Save (full-replace) a course's onboarding questions via POST, then refresh
 * the cache. In `fireAndForget` mode the save goes out via sendBeacon and the
 * input is echoed (no response to parse) — used for save-on-close.
 */
export function useUpdateCourseOnboarding(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      questions,
      fireAndForget,
    }: UpdateOnboardingVars): Promise<OnboardingQuestion[]> => {
      const saved = await saveJson({
        url: `/api/admin/courses/${courseId}/onboarding`,
        method: 'POST',
        body: { questions },
        fireAndForget,
        parse: (json) => OnboardingQuestionsSchema.parse(json),
      });
      return saved ?? questions;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseOnboarding(courseId),
      });
    },
  });
}
