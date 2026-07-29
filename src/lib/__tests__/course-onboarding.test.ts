import { describe, expect, it } from 'vitest';
import {
  countQuestions,
  flattenQuestions,
  hashQuestionSet,
  isOnboardingComplete,
  pendingQuestions,
  shouldOfferOnboarding,
} from '#/lib/course-onboarding';
import type { OnboardingAnswers, OnboardingQuestions } from '#/types';

// Named rather than reached for by index, so the many derived fixtures below
// don't need a non-null assertion apiece.
const Q1 = { id: 'q1', text: 'What is your flying experience?' };
const Q2 = { id: 'q2', text: 'What do you want from this course?' };
const Q3 = { id: 'q3', text: 'Anything else?' };

const BACKGROUND = { id: 'c1', name: 'Background', questions: [Q1, Q2] };
const GOALS = { id: 'c2', name: 'Goals', questions: [Q3] };

/** Two categories so category-boundary behaviour is exercised, not assumed. */
const CATEGORIES: OnboardingQuestions = [BACKGROUND, GOALS];

const FLAT = flattenQuestions(CATEGORIES);

describe('flattenQuestions', () => {
  it('emits category order then question order', () => {
    expect(FLAT.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('tags each question with the category it came from', () => {
    expect(FLAT.map((q) => q.categoryName)).toEqual([
      'Background',
      'Background',
      'Goals',
    ]);
    expect(FLAT.map((q) => q.categoryId)).toEqual(['c1', 'c1', 'c2']);
  });

  it('keeps a category’s questions contiguous, so a boundary is unambiguous', () => {
    // The prompt groups by CONSECUTIVE runs of categoryId. If flattening ever
    // interleaved, that grouping would emit a duplicate heading.
    const ids = FLAT.map((q) => q.categoryId);
    expect(new Set(ids).size).toBe(
      ids.filter((id, i) => id !== ids[i - 1]).length,
    );
  });

  it('preserves question text', () => {
    expect(FLAT[0]?.text).toBe('What is your flying experience?');
  });

  it('drops empty categories rather than emitting a placeholder', () => {
    const withEmpty: OnboardingQuestions = [
      { id: 'c0', name: 'Empty', questions: [] },
      ...CATEGORIES,
    ];
    expect(flattenQuestions(withEmpty).map((q) => q.id)).toEqual([
      'q1',
      'q2',
      'q3',
    ]);
  });

  it('returns nothing for no categories', () => {
    expect(flattenQuestions([])).toEqual([]);
  });
});

describe('countQuestions', () => {
  it('counts across categories, not categories themselves', () => {
    expect(countQuestions(CATEGORIES)).toBe(3);
  });

  it('is zero when every category is empty', () => {
    // The case that would otherwise resolve to the 'admin' source with nothing
    // to ask — see resolveQuestionSet.
    expect(
      countQuestions([
        { id: 'a', name: 'A', questions: [] },
        { id: 'b', name: 'B', questions: [] },
      ]),
    ).toBe(0);
  });

  it('is zero for no categories', () => {
    expect(countQuestions([])).toBe(0);
  });
});

describe('hashQuestionSet', () => {
  it('is deterministic for the same input', () => {
    expect(hashQuestionSet(CATEGORIES)).toBe(hashQuestionSet(CATEGORIES));
  });

  it('returns 16 lowercase hex chars, well inside varchar(64)', () => {
    expect(hashQuestionSet(CATEGORIES)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles an empty question set', () => {
    expect(hashQuestionSet([])).toMatch(/^[0-9a-f]{16}$/);
    expect(hashQuestionSet([])).toBe(hashQuestionSet([]));
  });

  it('changes when questions are reordered within a category', () => {
    const reordered: OnboardingQuestions = [
      { ...BACKGROUND, questions: [Q2, Q1] },
      GOALS,
    ];
    expect(hashQuestionSet(reordered)).not.toBe(hashQuestionSet(CATEGORIES));
  });

  it('changes when categories are reordered', () => {
    const reordered = [GOALS, BACKGROUND];
    expect(hashQuestionSet(reordered)).not.toBe(hashQuestionSet(CATEGORIES));
  });

  it('changes when a category is renamed', () => {
    // A rename changes what the agent says when it moves between areas, so it
    // is a real change to the interview, not just presentation.
    const renamed: OnboardingQuestions = [
      { ...BACKGROUND, name: 'Flying background' },
      GOALS,
    ];
    expect(hashQuestionSet(renamed)).not.toBe(hashQuestionSet(CATEGORIES));
  });

  it('changes when a category id changes', () => {
    const reIded: OnboardingQuestions = [{ ...BACKGROUND, id: 'c9' }, GOALS];
    expect(hashQuestionSet(reIded)).not.toBe(hashQuestionSet(CATEGORIES));
  });

  it('changes when a question text is edited', () => {
    const edited: OnboardingQuestions = [
      {
        ...BACKGROUND,
        questions: [Q1, { id: 'q2', text: 'Why this course?' }],
      },
      GOALS,
    ];
    expect(hashQuestionSet(edited)).not.toBe(hashQuestionSet(CATEGORIES));
  });

  it('changes when a question id is changed', () => {
    const edited: OnboardingQuestions = [
      { ...BACKGROUND, questions: [Q1, { ...Q2, id: 'q9' }] },
      GOALS,
    ];
    expect(hashQuestionSet(edited)).not.toBe(hashQuestionSet(CATEGORIES));
  });

  it('changes when a question is added', () => {
    const added: OnboardingQuestions = [
      { ...BACKGROUND, questions: [Q1, Q2, { id: 'q4', text: 'One more?' }] },
      GOALS,
    ];
    expect(hashQuestionSet(added)).not.toBe(hashQuestionSet(CATEGORIES));
  });

  it('changes when a question is removed', () => {
    const removed: OnboardingQuestions = [
      { ...BACKGROUND, questions: [Q1] },
      GOALS,
    ];
    expect(hashQuestionSet(removed)).not.toBe(hashQuestionSet(CATEGORIES));
  });

  it('distinguishes one category of two from two categories of one', () => {
    // Same flattened questions, different grouping — and therefore a different
    // interview, because the agent signposts the boundary between them.
    const oneCategory: OnboardingQuestions = [
      {
        id: 'c1',
        name: 'All',
        questions: [
          { id: 'q1', text: 'a' },
          { id: 'q2', text: 'b' },
        ],
      },
    ];
    const twoCategories: OnboardingQuestions = [
      { id: 'c1', name: 'All', questions: [{ id: 'q1', text: 'a' }] },
      { id: 'c2', name: 'All', questions: [{ id: 'q2', text: 'b' }] },
    ];
    expect(hashQuestionSet(oneCategory)).not.toBe(
      hashQuestionSet(twoCategories),
    );
  });

  it('does not collide when text contains the field delimiter', () => {
    // A naive `${id}:${text}` encoding renders both of these as "a:b:c".
    const a: OnboardingQuestions = [
      { id: 'c', name: 'n', questions: [{ id: 'a', text: 'b:c' }] },
    ];
    const b: OnboardingQuestions = [
      { id: 'c', name: 'n', questions: [{ id: 'a:b', text: 'c' }] },
    ];
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });

  it('does not collide when text contains digits that mimic a length prefix', () => {
    const a: OnboardingQuestions = [
      { id: 'c', name: 'n', questions: [{ id: 'a', text: '1:b' }] },
    ];
    const b: OnboardingQuestions = [
      { id: 'c', name: 'n', questions: [{ id: 'a1', text: ':b' }] },
    ];
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });

  it('does not collide when a category name could be confused with a question', () => {
    const a: OnboardingQuestions = [
      { id: 'c', name: 'ab', questions: [{ id: 'q', text: 'z' }] },
    ];
    const b: OnboardingQuestions = [
      { id: 'c', name: 'a', questions: [{ id: 'bq', text: 'z' }] },
    ];
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });

  it('handles multi-byte characters', () => {
    const a: OnboardingQuestions = [
      { id: 'c', name: 'n', questions: [{ id: 'q1', text: 'café ✈︎' }] },
    ];
    const b: OnboardingQuestions = [
      { id: 'c', name: 'n', questions: [{ id: 'q1', text: 'cafe ✈︎' }] },
    ];
    expect(hashQuestionSet(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashQuestionSet(a)).not.toBe(hashQuestionSet(b));
  });
});

describe('pendingQuestions', () => {
  it('returns every question when there are no answers', () => {
    expect(pendingQuestions(FLAT, {})).toEqual(FLAT);
  });

  it('returns nothing when every question is answered', () => {
    const answers: OnboardingAnswers = { q1: 'a', q2: 'b', q3: 'c' };
    expect(pendingQuestions(FLAT, answers)).toEqual([]);
  });

  it('returns only the unanswered questions', () => {
    expect(pendingQuestions(FLAT, { q1: 'a', q3: 'c' })).toEqual([FLAT[1]]);
  });

  it('preserves category order across the flattened list', () => {
    expect(pendingQuestions(FLAT, { q2: 'b' })).toEqual([FLAT[0], FLAT[2]]);
  });

  it('treats an empty-string answer as answered', () => {
    // The user visited the question and left it blank. Re-prompting forever
    // would be wrong.
    expect(pendingQuestions(FLAT, { q1: '', q2: '', q3: '' })).toEqual([]);
  });

  it('ignores orphan answers for questions that no longer exist', () => {
    const answers: OnboardingAnswers = {
      q1: 'a',
      q2: 'b',
      q3: 'c',
      qGone: 'old',
    };
    expect(pendingQuestions(FLAT, answers)).toEqual([]);
  });

  it('reports a newly added question as pending', () => {
    const added = flattenQuestions([
      BACKGROUND,
      { ...GOALS, questions: [Q3, { id: 'q4', text: 'One more?' }] },
    ]);
    expect(pendingQuestions(added, { q1: 'a', q2: 'b', q3: 'c' })).toEqual([
      added[3],
    ]);
  });

  it('does not treat inherited Object properties as answers', () => {
    const tricky = flattenQuestions([
      {
        id: 'c',
        name: 'n',
        questions: [
          { id: 'toString', text: 'Trick question' },
          { id: 'constructor', text: 'Another one' },
        ],
      },
    ]);
    expect(pendingQuestions(tricky, {})).toEqual(tricky);
  });

  it('returns nothing when the course has no questions', () => {
    expect(pendingQuestions([], {})).toEqual([]);
  });
});

describe('isOnboardingComplete', () => {
  const answered: OnboardingAnswers = { q1: 'a', q2: 'b', q3: 'c' };

  it('is false when the user never finished the flow', () => {
    expect(isOnboardingComplete(FLAT, answered, null)).toBe(false);
  });

  it('is true when the flow is finished and nothing is pending', () => {
    expect(isOnboardingComplete(FLAT, answered, new Date(0))).toBe(true);
  });

  it('is false when finished earlier but a new question was since added', () => {
    const added = flattenQuestions([
      ...CATEGORIES,
      { id: 'c3', name: 'Extra', questions: [{ id: 'q4', text: 'More?' }] },
    ]);
    expect(isOnboardingComplete(added, answered, new Date(0))).toBe(false);
  });

  it('is false when an orphan answer exists for a question that no longer exists', () => {
    expect(isOnboardingComplete(FLAT, { qGone: 'x' }, new Date(0))).toBe(false);
  });

  it('is true for a course with no questions once the flow is finished', () => {
    expect(isOnboardingComplete([], {}, new Date(0))).toBe(true);
  });

  it('is false when onboardingCompletedAt is undefined despite nothing being pending', () => {
    // Guards against `!== null`, which is true for `undefined` too. The typed
    // signature is `Date | null`, but `undefined` can still arrive here
    // across a serialization boundary.
    expect(
      isOnboardingComplete(FLAT, answered, undefined as unknown as null),
    ).toBe(false);
  });
});

describe('shouldOfferOnboarding', () => {
  it('offers when there is no row at all', () => {
    expect(shouldOfferOnboarding(null)).toBe(true);
  });

  it('offers when the row exists but is untouched', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: null,
        consentDeclinedAt: null,
        deletedAt: null,
      }),
    ).toBe(true);
  });

  it('does not offer once onboarding is complete', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: new Date(0),
        consentDeclinedAt: null,
        deletedAt: null,
      }),
    ).toBe(false);
  });

  it('does not offer once consent was declined', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: null,
        consentDeclinedAt: new Date(0),
        deletedAt: null,
      }),
    ).toBe(false);
  });

  it('does not offer when both are set', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: new Date(0),
        consentDeclinedAt: new Date(0),
        deletedAt: null,
      }),
    ).toBe(false);
  });

  it('does not offer once the user withdrew (deletedAt set alone)', () => {
    // The user asked to delete everything they shared. Re-offering on their
    // next visit would be the exact re-pitch they withdrew from.
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: null,
        consentDeclinedAt: null,
        deletedAt: new Date(0),
      }),
    ).toBe(false);
  });

  it('does not offer when deletedAt is set alongside onboardingCompletedAt', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: new Date(0),
        consentDeclinedAt: null,
        deletedAt: new Date(0),
      }),
    ).toBe(false);
  });

  it('does not offer when deletedAt is set alongside consentDeclinedAt', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: null,
        consentDeclinedAt: new Date(0),
        deletedAt: new Date(0),
      }),
    ).toBe(false);
  });

  it('does not offer when all three timestamps are set', () => {
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: new Date(0),
        consentDeclinedAt: new Date(0),
        deletedAt: new Date(0),
      }),
    ).toBe(false);
  });

  it('does not offer when a timestamp arrives as undefined', () => {
    // Loose null checks, same reasoning as isOnboardingComplete.
    expect(
      shouldOfferOnboarding({
        onboardingCompletedAt: undefined as unknown as null,
        consentDeclinedAt: null,
        deletedAt: null,
      }),
    ).toBe(true);
    expect(shouldOfferOnboarding(undefined as unknown as null)).toBe(true);
  });
});
