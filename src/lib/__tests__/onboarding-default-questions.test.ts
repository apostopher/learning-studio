import { describe, expect, it } from 'vitest';
import { flattenQuestions } from '#/lib/course-onboarding';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import { OnboardingQuestionsSchema } from '#/types';

const FLAT = flattenQuestions(DEFAULT_ONBOARDING_QUESTIONS);

describe('DEFAULT_ONBOARDING_QUESTIONS', () => {
  it('is a valid onboarding question set', () => {
    expect(
      OnboardingQuestionsSchema.safeParse(DEFAULT_ONBOARDING_QUESTIONS).success,
    ).toBe(true);
  });

  it('covers the five themes from docs/onboarding.md', () => {
    expect(FLAT.map((q) => q.id)).toEqual([
      'core:background',
      'core:motivation',
      'core:learning-style',
      'core:schedule',
      'core:exam',
    ]);
  });

  it('namespaces every id so it cannot collide with an admin uuid', () => {
    for (const q of FLAT) {
      expect(q.id.startsWith('core:')).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = FLAT.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every question non-empty text', () => {
    for (const q of FLAT) {
      expect(q.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps all five in ONE category, so no transition ever fires', () => {
    // The five defaults cover five unrelated topics. One category each would
    // have the agent signpost a new area on every single turn — the worst
    // version of the category feature. A single category fires none, so this
    // fallback behaves exactly as it did before categories existed.
    expect(DEFAULT_ONBOARDING_QUESTIONS).toHaveLength(1);
    expect(new Set(FLAT.map((q) => q.categoryId)).size).toBe(1);
  });

  it('names the single category', () => {
    expect(DEFAULT_ONBOARDING_QUESTIONS[0]?.name).toBe('Getting to know you');
  });
});
