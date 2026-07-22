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
    expect(OnboardingQuestionsSchema.safeParse([{ text: 'x' }]).success).toBe(
      false,
    );
  });
  it('rejects a non-array', () => {
    expect(OnboardingQuestionsSchema.safeParse({}).success).toBe(false);
  });
  it('rejects an array longer than 50 items', () => {
    const questions = Array.from({ length: 51 }, (_, i) => ({
      id: `q${i}`,
      text: 'x',
    }));
    expect(OnboardingQuestionsSchema.safeParse(questions).success).toBe(false);
  });
  it('rejects a question whose text exceeds 2000 chars', () => {
    const r = OnboardingQuestionsSchema.safeParse([
      { id: 'a', text: 'x'.repeat(2001) },
    ]);
    expect(r.success).toBe(false);
  });
});
