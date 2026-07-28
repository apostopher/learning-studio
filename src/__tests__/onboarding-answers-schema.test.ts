import { describe, expect, it } from 'vitest';
import { OnboardingAnswersSchema } from '#/types';

describe('OnboardingAnswersSchema', () => {
  it('accepts an empty map', () => {
    expect(OnboardingAnswersSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a questionId to answer map', () => {
    const r = OnboardingAnswersSchema.safeParse({
      q1: 'Two years, mostly FPV.',
      q2: 'BVLOS confidence.',
    });
    expect(r.success).toBe(true);
  });

  it('accepts an empty-string answer', () => {
    // A question the user visited and deliberately left blank still counts as
    // answered — see pendingQuestions in src/lib/course-onboarding.ts.
    expect(OnboardingAnswersSchema.safeParse({ q1: '' }).success).toBe(true);
  });

  it('rejects a non-string answer', () => {
    expect(OnboardingAnswersSchema.safeParse({ q1: 42 }).success).toBe(false);
  });

  it('rejects a null answer', () => {
    expect(OnboardingAnswersSchema.safeParse({ q1: null }).success).toBe(false);
  });

  it('rejects an answer longer than 5000 chars', () => {
    const r = OnboardingAnswersSchema.safeParse({ q1: 'x'.repeat(5001) });
    expect(r.success).toBe(false);
  });

  it('accepts an answer of exactly 5000 chars', () => {
    const r = OnboardingAnswersSchema.safeParse({ q1: 'x'.repeat(5000) });
    expect(r.success).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(OnboardingAnswersSchema.safeParse([]).success).toBe(false);
  });
});
