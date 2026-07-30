import { describe, expect, it } from 'vitest';
import { buildQuizAnswers, emptyQuizProgress } from '#/lib/lesson-quiz';
import type { CourseLessonQuizQuestion } from '#/types';
import {
  computeLessonQuizView,
  type LessonQuizViewInput,
} from '../compute-lesson-quiz-view';

const question = (id: string): CourseLessonQuizQuestion => ({
  id,
  question: `<p>${id}?</p>`,
  options: [
    { id: 'a', value: '<p>right</p>' },
    { id: 'b', value: '<p>wrong</p>' },
  ],
  correctOptionId: 'a',
});

const askable = [question('q1'), question('q2')];

const input = (
  overrides: Partial<LessonQuizViewInput> = {},
): LessonQuizViewInput => ({
  askable,
  isFetched: true,
  saved: null,
  isRetaking: false,
  storedProgress: null,
  ...overrides,
});

describe('computeLessonQuizView', () => {
  it('is empty when no question survived validation', () => {
    expect(computeLessonQuizView(input({ askable: [] })).kind).toBe('empty');
  });

  it('is empty even before the saved result has fetched', () => {
    // No usable quiz means nothing to say either way; a skeleton first would
    // just be a flicker.
    expect(
      computeLessonQuizView(input({ askable: [], isFetched: false })).kind,
    ).toBe('empty');
  });

  it('loads until the saved result has fetched', () => {
    // The consequential part: no 'quiz' view means no option is tappable, so a
    // tap cannot be discarded by an attempt landing a moment later.
    expect(computeLessonQuizView(input({ isFetched: false })).kind).toBe(
      'loading',
    );
  });

  it('starts a fresh quiz at question one', () => {
    const view = computeLessonQuizView(input());
    expect(view).toMatchObject({
      kind: 'quiz',
      index: 0,
      resultAnswers: null,
      source: 'local',
    });
  });

  it('shows the saved attempt on the result slide', () => {
    const saved = buildQuizAnswers(askable, { q1: 'a', q2: 'b' });
    const view = computeLessonQuizView(input({ saved }));

    expect(view).toMatchObject({ kind: 'quiz', index: 2, source: 'saved' });
    expect(view.kind === 'quiz' && view.resultAnswers).toEqual(saved);
  });

  it('shows the quiz, not the saved attempt, while retaking', () => {
    const saved = buildQuizAnswers(askable, { q1: 'a', q2: 'a' });
    const view = computeLessonQuizView(input({ saved, isRetaking: true }));
    expect(view).toMatchObject({ kind: 'quiz', index: 0, source: 'local' });
  });

  it('keeps an in-progress retake after a reload has cleared isRetaking', () => {
    // `isRetaking` lives in memory only. Without local progress winning here, a
    // reload mid-retake throws the student back to their old result and drops
    // the answers they had already given.
    const saved = buildQuizAnswers(askable, { q1: 'b', q2: 'b' });
    const view = computeLessonQuizView(
      input({
        saved,
        isRetaking: false,
        storedProgress: {
          index: 1,
          answers: { q1: 'a' },
          revealedQuestionId: null,
        },
      }),
    );

    expect(view).toMatchObject({ kind: 'quiz', index: 1, source: 'local' });
    expect(view.kind === 'quiz' && view.answers).toEqual({ q1: 'a' });
  });

  it('restores a held wrong answer', () => {
    const view = computeLessonQuizView(
      input({
        storedProgress: {
          index: 0,
          answers: { q1: 'b' },
          revealedQuestionId: 'q1',
        },
      }),
    );
    expect(view).toMatchObject({
      kind: 'quiz',
      index: 0,
      revealedQuestionId: 'q1',
    });
  });

  it('discards stored progress that no longer fits the quiz', () => {
    // Admin deleted the question this progress refers to.
    const view = computeLessonQuizView(
      input({
        storedProgress: {
          index: 1,
          answers: { gone: 'a' },
          revealedQuestionId: null,
        },
      }),
    );
    expect(view).toMatchObject({ kind: 'quiz', index: 0 });
    expect(view.kind === 'quiz' && view.answers).toEqual({});
  });

  it('builds result answers from local progress once every question is answered', () => {
    const view = computeLessonQuizView(
      input({
        storedProgress: {
          index: 2,
          answers: { q1: 'a', q2: 'b' },
          revealedQuestionId: null,
        },
      }),
    );

    expect(view).toMatchObject({ kind: 'quiz', source: 'local' });
    // `source: 'local'` is what tells the container this attempt may still need
    // submitting — a completed attempt whose POST failed reaches here again on
    // reload and gets another try.
    expect(view.kind === 'quiz' && view.resultAnswers).toEqual(
      buildQuizAnswers(askable, { q1: 'a', q2: 'b' }),
    );
  });

  it('treats untouched progress as not started', () => {
    const saved = buildQuizAnswers(askable, { q1: 'a', q2: 'a' });
    const view = computeLessonQuizView(
      input({ saved, storedProgress: emptyQuizProgress }),
    );
    expect(view).toMatchObject({ source: 'saved' });
  });
});
