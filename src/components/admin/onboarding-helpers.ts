import type { OnboardingCategory, OnboardingQuestion } from '#/types';

/** A new blank onboarding question with a stable unique id. */
export function createEmptyQuestion(): OnboardingQuestion {
  return { id: crypto.randomUUID(), text: '' };
}

/**
 * A new category with one blank question already in it.
 *
 * Seeded rather than empty on purpose: an empty category is skipped entirely
 * at interview time (it has nothing to ask), so an admin who adds one and
 * navigates away has silently created a no-op. Starting with a question makes
 * the thing they just created do something.
 */
export function createEmptyCategory(): OnboardingCategory {
  return {
    id: crypto.randomUUID(),
    name: '',
    questions: [createEmptyQuestion()],
  };
}

/** Total questions across all categories — the cap is set-wide, not per category. */
export function countCategoryQuestions(
  categories: readonly OnboardingCategory[],
): number {
  return categories.reduce((sum, c) => sum + c.questions.length, 0);
}
