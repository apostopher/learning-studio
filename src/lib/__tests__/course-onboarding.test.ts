import { describe, expect, it } from 'vitest';
import { hashQuestionSet } from '#/lib/course-onboarding';
import type { OnboardingQuestions } from '#/types';

const QUESTIONS: OnboardingQuestions = [
  { id: 'q1', text: 'What is your flying experience?' },
  { id: 'q2', text: 'What do you want from this course?' },
];

describe('hashQuestionSet', () => {
  it('is deterministic for the same input', () => {
    expect(hashQuestionSet(QUESTIONS)).toBe(hashQuestionSet(QUESTIONS));
  });

  it('returns 16 lowercase hex chars, well inside varchar(64)', () => {
    expect(hashQuestionSet(QUESTIONS)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles an empty question set', () => {
    expect(hashQuestionSet([])).toMatch(/^[0-9a-f]{16}$/);
    expect(hashQuestionSet([])).toBe(hashQuestionSet([]));
  });

  it('changes when questions are reordered', () => {
    const reordered = [QUESTIONS[1], QUESTIONS[0]];
    expect(hashQuestionSet(reordered)).not.toBe(hashQuestionSet(QUESTIONS));
  });

  it('changes when a question text is edited', () => {
    const edited = [QUESTIONS[0], { id: 'q2', text: 'Why this course?' }];
    expect(hashQuestionSet(edited)).not.toBe(hashQuestionSet(QUESTIONS));
  });

  it('changes when a question id is changed', () => {
    const edited = [QUESTIONS[0], { ...QUESTIONS[1], id: 'q3' }];
    expect(hashQuestionSet(edited)).not.toBe(hashQuestionSet(QUESTIONS));
  });

  it('changes when a question is added', () => {
    const added = [...QUESTIONS, { id: 'q3', text: 'Anything else?' }];
    expect(hashQuestionSet(added)).not.toBe(hashQuestionSet(QUESTIONS));
  });

  it('changes when a question is removed', () => {
    expect(hashQuestionSet([QUESTIONS[0]])).not.toBe(
      hashQuestionSet(QUESTIONS),
    );
  });

  it('does not collide when text contains the field delimiter', () => {
    // A naive `${id}:${text}` encoding renders both of these as "a:b:c".
    const a: OnboardingQuestions = [{ id: 'a', text: 'b:c' }];
    const b: OnboardingQuestions = [{ id: 'a:b', text: 'c' }];
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });

  it('does not collide when text contains digits that mimic a length prefix', () => {
    const a: OnboardingQuestions = [{ id: 'a', text: '1:b' }];
    const b: OnboardingQuestions = [{ id: 'a1', text: ':b' }];
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });

  it('handles multi-byte characters', () => {
    const a: OnboardingQuestions = [{ id: 'q1', text: 'café ✈︎' }];
    const b: OnboardingQuestions = [{ id: 'q1', text: 'cafe ✈︎' }];
    expect(hashQuestionSet(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });
});
