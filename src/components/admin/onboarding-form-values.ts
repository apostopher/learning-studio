import type { OnboardingQuestions } from '#/types';

/**
 * The onboarding editor's react-hook-form shape.
 *
 * Shared rather than redeclared per component: the editor used to carry its
 * own structural copy of this interface, which silently stopped matching the
 * real question type the moment categories were introduced. `register()` paths
 * like `categories.${i}.questions.${j}.text` are typechecked against this, so a
 * drifted copy turns a compile error into a runtime no-op field.
 */
export interface OnboardingFormValues {
  categories: OnboardingQuestions;
}
