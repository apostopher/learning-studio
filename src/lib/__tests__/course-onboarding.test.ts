import { describe, expect, it } from 'vitest';
import {
  hashQuestionSet,
  isOnboardingComplete,
  pendingQuestions,
} from '#/lib/course-onboarding';
import type { OnboardingAnswers, OnboardingQuestions } from '#/types';

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

describe('pendingQuestions', () => {
  it('returns every question when there are no answers', () => {
    expect(pendingQuestions(QUESTIONS, {})).toEqual(QUESTIONS);
  });

  it('returns nothing when every question is answered', () => {
    const answers: OnboardingAnswers = { q1: 'a', q2: 'b' };
    expect(pendingQuestions(QUESTIONS, answers)).toEqual([]);
  });

  it('returns only the unanswered questions', () => {
    expect(pendingQuestions(QUESTIONS, { q1: 'a' })).toEqual([QUESTIONS[1]]);
  });

  it('preserves the course question order', () => {
    const three: OnboardingQuestions = [
      ...QUESTIONS,
      { id: 'q3', text: 'Anything else?' },
    ];
    expect(pendingQuestions(three, { q2: 'b' })).toEqual([three[0], three[2]]);
  });

  it('treats an empty-string answer as answered', () => {
    // The user visited the question and left it blank. Re-prompting forever
    // would be wrong.
    expect(pendingQuestions(QUESTIONS, { q1: '', q2: '' })).toEqual([]);
  });

  it('ignores orphan answers for questions that no longer exist', () => {
    const answers: OnboardingAnswers = { q1: 'a', q2: 'b', qGone: 'old' };
    expect(pendingQuestions(QUESTIONS, answers)).toEqual([]);
  });

  it('reports a newly added question as pending', () => {
    const added: OnboardingQuestions = [
      ...QUESTIONS,
      { id: 'q3', text: 'Anything else?' },
    ];
    expect(pendingQuestions(added, { q1: 'a', q2: 'b' })).toEqual([added[2]]);
  });

  it('does not treat inherited Object properties as answers', () => {
    const tricky: OnboardingQuestions = [
      { id: 'toString', text: 'Trick question' },
      { id: 'constructor', text: 'Another one' },
    ];
    expect(pendingQuestions(tricky, {})).toEqual(tricky);
  });

  it('returns nothing when the course has no questions', () => {
    expect(pendingQuestions([], {})).toEqual([]);
  });
});

describe('isOnboardingComplete', () => {
  const answered: OnboardingAnswers = { q1: 'a', q2: 'b' };

  it('is false when the user never finished the flow', () => {
    expect(isOnboardingComplete(QUESTIONS, answered, null)).toBe(false);
  });

  it('is true when the flow is finished and nothing is pending', () => {
    expect(isOnboardingComplete(QUESTIONS, answered, new Date(0))).toBe(true);
  });

  it('is false when finished earlier but a new question was since added', () => {
    const added: OnboardingQuestions = [
      ...QUESTIONS,
      { id: 'q3', text: 'Anything else?' },
    ];
    expect(isOnboardingComplete(added, answered, new Date(0))).toBe(false);
  });

  it('is false when an orphan answer exists for a question that no longer exists', () => {
    expect(isOnboardingComplete(QUESTIONS, { qGone: 'x' }, new Date(0))).toBe(
      false,
    );
  });

  it('is true for a course with no questions once the flow is finished', () => {
    expect(isOnboardingComplete([], {}, new Date(0))).toBe(true);
  });

  it('is false when onboardingCompletedAt is undefined despite nothing being pending', () => {
    // Guards against `!== null`, which is true for `undefined` too. The typed
    // signature is `Date | null`, but `undefined` can still arrive here
    // across a serialization boundary.
    expect(
      isOnboardingComplete(QUESTIONS, answered, undefined as unknown as null),
    ).toBe(false);
  });
});
