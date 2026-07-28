import { describe, expect, it } from 'vitest';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import { resolveQuestionSet } from '#/lib/onboarding-session';
import type { OnboardingQuestions } from '#/types';

const ADMIN: OnboardingQuestions = [
  { id: 'a1b2', text: 'Which airframe do you fly most?' },
  { id: 'c3d4', text: 'What does a good sortie look like to you?' },
];

describe('resolveQuestionSet', () => {
  it('uses the admin questions when the course has any', () => {
    expect(resolveQuestionSet(ADMIN)).toEqual({
      questions: ADMIN,
      source: 'admin',
    });
  });

  it('falls back to the defaults when the course has none', () => {
    expect(resolveQuestionSet([])).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });

  it('honours a frozen default source even after admin questions appear', () => {
    // The whole point of freezing: a user who onboarded on defaults must not
    // be re-interviewed when an admin later adds questions.
    expect(resolveQuestionSet(ADMIN, 'default')).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });

  it('honours a frozen admin source even after the admin deletes every question', () => {
    expect(resolveQuestionSet([], 'admin')).toEqual({
      questions: [],
      source: 'admin',
    });
  });

  it('treats a null frozen source as unfrozen and resolves fresh', () => {
    // Rows created before question_source existed.
    expect(resolveQuestionSet(ADMIN, null)).toEqual({
      questions: ADMIN,
      source: 'admin',
    });
    expect(resolveQuestionSet([], null)).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });

  it('treats an undefined frozen source as unfrozen', () => {
    expect(resolveQuestionSet([], undefined)).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });
});
