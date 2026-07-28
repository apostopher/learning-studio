import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import type { OnboardingQuestions } from '#/types';

export type OnboardingQuestionSource = 'admin' | 'default';

export type ResolvedQuestionSet = {
  questions: OnboardingQuestions;
  source: OnboardingQuestionSource;
};

/**
 * The effective question set for an onboarding row.
 *
 * Fallback, not merge: admin questions win when the course has any, otherwise
 * the built-in defaults. Resolved once when the row is created and then frozen
 * in course_onboarding.question_source.
 *
 * `frozenSource` null/undefined means the row predates the column, so resolve
 * fresh — correct, because such rows have no answers yet.
 */
export const resolveQuestionSet = (
  courseQuestions: OnboardingQuestions,
  frozenSource?: OnboardingQuestionSource | null,
): ResolvedQuestionSet => {
  const source: OnboardingQuestionSource =
    frozenSource ?? (courseQuestions.length > 0 ? 'admin' : 'default');

  return {
    questions:
      source === 'admin' ? courseQuestions : DEFAULT_ONBOARDING_QUESTIONS,
    source,
  };
};
