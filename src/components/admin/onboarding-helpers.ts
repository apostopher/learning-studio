import type { OnboardingQuestion } from '#/types';

/** A new blank onboarding question with a stable unique id. */
export function createEmptyQuestion(): OnboardingQuestion {
  return { id: crypto.randomUUID(), text: '' };
}
