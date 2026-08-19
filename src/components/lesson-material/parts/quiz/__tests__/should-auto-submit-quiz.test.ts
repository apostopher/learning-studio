import { describe, expect, it } from 'vitest';
import type { CourseLessonQuizAnswers } from '#/types';
import { shouldAutoSubmitQuiz } from '../should-auto-submit-quiz';

const answers: CourseLessonQuizAnswers = [];

describe('shouldAutoSubmitQuiz', () => {
  it('submits a finished local attempt', () => {
    expect(
      shouldAutoSubmitQuiz({
        pendingAnswers: answers,
        alreadySubmitted: false,
        isPending: false,
        readOnly: false,
      }),
    ).toBe(true);
  });

  it('does not submit with nothing pending', () => {
    expect(
      shouldAutoSubmitQuiz({
        pendingAnswers: null,
        alreadySubmitted: false,
        isPending: false,
        readOnly: false,
      }),
    ).toBe(false);
  });

  it('does not submit a second time once already submitted', () => {
    expect(
      shouldAutoSubmitQuiz({
        pendingAnswers: answers,
        alreadySubmitted: true,
        isPending: false,
        readOnly: false,
      }),
    ).toBe(false);
  });

  it('does not submit while a submission is already in flight', () => {
    expect(
      shouldAutoSubmitQuiz({
        pendingAnswers: answers,
        alreadySubmitted: false,
        isPending: true,
        readOnly: false,
      }),
    ).toBe(false);
  });

  // The load-bearing case: this effect fires from a rendered state, not a
  // button press, on every render where a finished local attempt exists — a
  // pilot who finishes a quiz on a lesson that has since gone read-only (or
  // opens an archive lesson with stale localStorage progress from before
  // their level changed) must never have this effect POST it.
  it('never submits in read-only mode, even with a fully pending finished attempt', () => {
    expect(
      shouldAutoSubmitQuiz({
        pendingAnswers: answers,
        alreadySubmitted: false,
        isPending: false,
        readOnly: true,
      }),
    ).toBe(false);
  });
});
