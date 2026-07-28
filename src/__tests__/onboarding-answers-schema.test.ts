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

  it('rejects a key longer than 128 chars', () => {
    const key = 'q'.repeat(129);
    expect(OnboardingAnswersSchema.safeParse({ [key]: 'x' }).success).toBe(
      false,
    );
  });

  it('accepts a key of exactly 128 chars', () => {
    const key = 'q'.repeat(128);
    expect(OnboardingAnswersSchema.safeParse({ [key]: 'x' }).success).toBe(
      true,
    );
  });

  it('accepts a map with exactly 500 entries', () => {
    const answers = Object.fromEntries(
      Array.from({ length: 500 }, (_, i) => [`q${i}`, 'x']),
    );
    expect(OnboardingAnswersSchema.safeParse(answers).success).toBe(true);
  });

  it('rejects a map with 501 entries', () => {
    // Deleted questions deliberately leave orphan answers in place, so this
    // cap must stay well above the 50-question limit — it is not a stand-in
    // for capping the number of current questions.
    const answers = Object.fromEntries(
      Array.from({ length: 501 }, (_, i) => [`q${i}`, 'x']),
    );
    expect(OnboardingAnswersSchema.safeParse(answers).success).toBe(false);
  });
});
