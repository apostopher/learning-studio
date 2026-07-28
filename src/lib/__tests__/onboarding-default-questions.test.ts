import { describe, expect, it } from 'vitest';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import { OnboardingQuestionsSchema } from '#/types';

describe('DEFAULT_ONBOARDING_QUESTIONS', () => {
  it('is a valid onboarding question set', () => {
    expect(
      OnboardingQuestionsSchema.safeParse(DEFAULT_ONBOARDING_QUESTIONS).success,
    ).toBe(true);
  });

  it('covers the five themes from docs/onboarding.md', () => {
    expect(DEFAULT_ONBOARDING_QUESTIONS.map((q) => q.id)).toEqual([
      'core:background',
      'core:motivation',
      'core:learning-style',
      'core:schedule',
      'core:exam',
    ]);
  });

  it('namespaces every id so it cannot collide with an admin uuid', () => {
    for (const q of DEFAULT_ONBOARDING_QUESTIONS) {
      expect(q.id.startsWith('core:')).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = DEFAULT_ONBOARDING_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every question non-empty text', () => {
    for (const q of DEFAULT_ONBOARDING_QUESTIONS) {
      expect(q.text.trim().length).toBeGreaterThan(0);
    }
  });
});
