import { describe, expect, it } from 'vitest';
import {
  MAX_ONBOARDING_CATEGORIES,
  MAX_ONBOARDING_QUESTIONS,
  OnboardingQuestionsSchema,
} from '#/types';

const category = (id: string, questions: { id: string; text: string }[]) => ({
  id,
  name: `Category ${id}`,
  questions,
});

describe('OnboardingQuestionsSchema', () => {
  it('accepts categories of {id, text} questions', () => {
    const r = OnboardingQuestionsSchema.safeParse([
      category('c1', [
        { id: 'a', text: 'What is your callsign?' },
        { id: 'b', text: '' },
      ]),
      category('c2', [{ id: 'c', text: 'Why this course?' }]),
    ]);
    expect(r.success).toBe(true);
  });

  it('accepts an empty array', () => {
    expect(OnboardingQuestionsSchema.safeParse([]).success).toBe(true);
  });

  it('accepts a category with no questions', () => {
    // Representable on purpose — the interview skips it rather than erroring,
    // so an admin mid-edit is never blocked by a validation failure.
    expect(
      OnboardingQuestionsSchema.safeParse([category('c1', [])]).success,
    ).toBe(true);
  });

  it('rejects a missing question id', () => {
    expect(
      OnboardingQuestionsSchema.safeParse([
        { id: 'c1', name: 'C', questions: [{ text: 'x' }] },
      ]).success,
    ).toBe(false);
  });

  it('rejects a missing category name', () => {
    expect(
      OnboardingQuestionsSchema.safeParse([
        { id: 'c1', questions: [{ id: 'a', text: 'x' }] },
      ]).success,
    ).toBe(false);
  });

  it('rejects an empty category name', () => {
    expect(
      OnboardingQuestionsSchema.safeParse([
        { id: 'c1', name: '', questions: [] },
      ]).success,
    ).toBe(false);
  });

  it('rejects a category name over 100 chars', () => {
    expect(
      OnboardingQuestionsSchema.safeParse([
        { id: 'c1', name: 'x'.repeat(101), questions: [] },
      ]).success,
    ).toBe(false);
  });

  it('rejects a flat question array (the pre-category shape)', () => {
    expect(
      OnboardingQuestionsSchema.safeParse([{ id: 'a', text: 'x' }]).success,
    ).toBe(false);
  });

  it('rejects a non-array', () => {
    expect(OnboardingQuestionsSchema.safeParse({}).success).toBe(false);
  });

  it(`rejects more than ${MAX_ONBOARDING_CATEGORIES} categories`, () => {
    const categories = Array.from(
      { length: MAX_ONBOARDING_CATEGORIES + 1 },
      (_, i) => category(`c${i}`, []),
    );
    expect(OnboardingQuestionsSchema.safeParse(categories).success).toBe(false);
  });

  it(`rejects more than ${MAX_ONBOARDING_QUESTIONS} questions in total`, () => {
    // The cap is set-wide, so it cannot be dodged by spreading questions
    // across categories: 3 categories of 20 is 60, over the limit of 50.
    const categories = Array.from({ length: 3 }, (_, c) =>
      category(
        `c${c}`,
        Array.from({ length: 20 }, (_, q) => ({ id: `q${c}-${q}`, text: 'x' })),
      ),
    );
    expect(OnboardingQuestionsSchema.safeParse(categories).success).toBe(false);
  });

  it(`accepts exactly ${MAX_ONBOARDING_QUESTIONS} questions spread across categories`, () => {
    const categories = Array.from({ length: 5 }, (_, c) =>
      category(
        `c${c}`,
        Array.from({ length: 10 }, (_, q) => ({ id: `q${c}-${q}`, text: 'x' })),
      ),
    );
    expect(OnboardingQuestionsSchema.safeParse(categories).success).toBe(true);
  });

  it('rejects a question whose text exceeds 2000 chars', () => {
    const r = OnboardingQuestionsSchema.safeParse([
      category('c1', [{ id: 'a', text: 'x'.repeat(2001) }]),
    ]);
    expect(r.success).toBe(false);
  });
});
