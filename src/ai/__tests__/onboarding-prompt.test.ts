import { describe, expect, it } from 'vitest';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import type { OnboardingQuestions } from '#/types';

const QUESTIONS: OnboardingQuestions = [
  { id: 'q1', text: 'What is your background?' },
  { id: 'q2', text: 'Why this course?' },
];

const base = {
  courseName: 'Remote Pilot Theory',
  questions: QUESTIONS,
  remindControls: false,
};

describe('onboardingSystemPrompt', () => {
  it('names the course', () => {
    expect(onboardingSystemPrompt(base)).toContain('Remote Pilot Theory');
  });

  it('includes every question it must cover', () => {
    const prompt = onboardingSystemPrompt(base);
    expect(prompt).toContain('What is your background?');
    expect(prompt).toContain('Why this course?');
  });

  it('instructs one question at a time', () => {
    expect(onboardingSystemPrompt(base).toLowerCase()).toContain(
      'one question at a time',
    );
  });

  it('states the three user controls', () => {
    const prompt = onboardingSystemPrompt(base).toLowerCase();
    expect(prompt).toContain('resume');
    expect(prompt).toContain('delete');
  });

  it('adds a control reminder only when asked', () => {
    const without = onboardingSystemPrompt(base);
    const with_ = onboardingSystemPrompt({ ...base, remindControls: true });
    expect(with_.length).toBeGreaterThan(without.length);
  });

  it('handles an empty question set without throwing', () => {
    expect(() =>
      onboardingSystemPrompt({ ...base, questions: [] }),
    ).not.toThrow();
  });
});
