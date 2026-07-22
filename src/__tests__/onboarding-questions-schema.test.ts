import { describe, expect, it } from 'vitest';
import { OnboardingQuestionsSchema } from '#/types';

describe('OnboardingQuestionsSchema', () => {
  it('accepts an array of {id, text}', () => {
    const r = OnboardingQuestionsSchema.safeParse([
      { id: 'a', text: 'What is your callsign?' },
      { id: 'b', text: '' },
    ]);
    expect(r.success).toBe(true);
  });
  it('accepts an empty array', () => {
    expect(OnboardingQuestionsSchema.safeParse([]).success).toBe(true);
  });
  it('rejects a missing id', () => {
    expect(
      OnboardingQuestionsSchema.safeParse([{ text: 'x' }]).success,
    ).toBe(false);
  });
  it('rejects a non-array', () => {
    expect(OnboardingQuestionsSchema.safeParse({}).success).toBe(false);
  });
});
