import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  debriefFeedbackAtom,
  debriefFocusAnswerAtom,
  debriefRetakeLaterAtom,
  debriefStartRequestedAtom,
  justFinishedDebriefAtom,
  startDebriefAttemptAtom,
} from '#/atoms/debrief';
import {
  computeDebriefPanel,
  debriefQuizView,
  type FinishedDebrief,
} from '#/components/lesson-material/compute-debrief-panel';

const LESSON = 'radio-calls';

const missed: FinishedDebrief = {
  lessonSlug: LESSON,
  finishedAt: 1,
  result: { passed: false, score: 40, setAverages: [30, 40] },
  revisitNotes: ['n'],
  score: null,
  note: 'retake',
};

/** The status after two misses: open for a retake at once. */
const openForRetake = {
  isPending: false,
  isError: false,
  dataUpdatedAt: 2,
  data: {
    state: {
      kind: 'open' as const,
      retake: true,
      resume: false,
      passed: false,
    },
    lessonOutstanding: [],
  },
};

/** What the Debrief tab renders from the store, as its containers read it. */
function tab(store: ReturnType<typeof createStore>) {
  const panel = computeDebriefPanel({
    status: openForRetake,
    finished: store.get(justFinishedDebriefAtom),
    lessonSlug: LESSON,
    attemptInProgress: false,
    startRequested: store.get(debriefStartRequestedAtom) === LESSON,
  });
  const view =
    panel.kind === 'take'
      ? debriefQuizView({
          readOnly: false,
          enabled:
            panel.resume || store.get(debriefStartRequestedAtom) === LESSON,
          resume: panel.resume,
          notOpen: null,
          hasAttempt: false,
          startError: null,
          hasCurrent: false,
          hasFeedback: false,
          hasOffer: false,
        })
      : null;
  return { panel, view };
}

describe('startDebriefAttemptAtom (Start, Retake now)', () => {
  it('takes the finished report down and starts the new attempt at once, not the intro', () => {
    const store = createStore();
    store.set(justFinishedDebriefAtom, missed);
    expect(tab(store).panel.kind).toBe('finished');

    store.set(startDebriefAttemptAtom, LESSON);

    const { panel, view } = tab(store);
    expect(panel).toEqual({ kind: 'take', retake: true, resume: false });
    expect(view).toBe('starting');
    // The pressed button goes away: the first answer box is what takes
    // focus (QuestionCard's autoFocusAnswer).
    expect(store.get(debriefFocusAnswerAtom)).toBe(true);
  });

  it("drops any feedback still held, so the new attempt never shows the last one's", () => {
    const store = createStore();
    store.set(debriefFeedbackAtom, {
      lessonSlug: LESSON,
      attemptId: 1,
      questionId: 'q1',
      position: '',
      question: '',
      answer: '',
      score: 0,
      feedback: '',
      setResult: null,
      prompt: '',
      nextLabel: '',
      report: missed,
    });
    store.set(startDebriefAttemptAtom, LESSON);
    expect(store.get(debriefFeedbackAtom)).toBeNull();
  });
});

describe('debriefRetakeLaterAtom (Later)', () => {
  it('closes the retake prompt and leaves the report on screen', () => {
    const store = createStore();
    store.set(justFinishedDebriefAtom, missed);
    store.set(debriefRetakeLaterAtom);
    expect(tab(store).panel).toEqual({
      kind: 'finished',
      report: { ...missed, note: null },
      availableAt: null,
    });
  });
});
