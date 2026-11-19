import { describe, expect, it } from 'vitest';
import type {
  DebriefAnswerResult,
  DebriefAttemptView,
} from '#/data-hooks/use-debrief-attempt';
import {
  DebriefNoSourceError,
  DebriefNotOpenError,
  DebriefPreparingError,
  DebriefRequestError,
} from '#/data-hooks/use-debrief-attempt';
import {
  type DebriefStatus,
  DebriefStatusError,
} from '#/data-hooks/use-debrief-status';
import { revisitNotesOf } from '#/lib/client-debrief-attempt';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import { DEBRIEF_SET1_MISSED_COPY } from '#/lib/debrief-copy';
import type { DebriefState } from '#/lib/debrief-schedule';
import { lessonTotalScore } from '#/lib/lesson-score';
import {
  answerErrorCopy,
  attemptFormat,
  computeDebriefPanel,
  continueErrorCopy,
  countdownTarget,
  currentDebriefQuestion,
  DEBRIEF_ANSWER_FAILED_COPY,
  DEBRIEF_ANSWER_FORBIDDEN_COPY,
  DEBRIEF_ANSWER_REFUSED_COPY,
  DEBRIEF_CONTINUE_FAILED_COPY,
  DEBRIEF_CONTINUE_REFUSED_COPY,
  DEBRIEF_FAILED_COPY,
  DEBRIEF_REFUSED_COPY,
  debriefQuizView,
  declinedDebriefReport,
  type FinishedDebrief,
  feedbackNextLabel,
  finishedDebriefReport,
  questionPosition,
  setAveragesOf,
  startErrorOf,
} from '../compute-debrief-panel';

const LESSON = 'radio-calls';
const AT = '2026-10-28T15:40:00.000Z';
const FINISHED_AT = Date.parse('2026-10-28T09:40:00.000Z');

const outstanding: OutstandingItem[] = [
  { kind: 'video' },
  { kind: 'section', section: 'links' },
];

type Attempts = NonNullable<DebriefStatus['attempts']>;

const historyAttempt = (id: number, totalScore: number): Attempts[number] => ({
  id,
  totalScore,
  completedAt: '2026-10-27T10:00:00.000Z',
  passed: totalScore === 100,
  questions: [],
  evaluations: [],
});

const loaded = (
  state: DebriefState,
  extra: Partial<DebriefStatus> = {},
  dataUpdatedAt = FINISHED_AT + 1,
) => ({
  isPending: false,
  isError: false,
  dataUpdatedAt,
  data: { state, lessonOutstanding: [], ...extra },
});

/** The lesson total a set average gives on a video + quiz + debrief lesson. */
const totalAt = (average: number, passMark = 85) =>
  lessonTotalScore({ video: 1, quiz: 0.8, debrief: average / 100 }, passMark);

const finished = (over: Partial<FinishedDebrief> = {}): FinishedDebrief => ({
  lessonSlug: LESSON,
  finishedAt: FINISHED_AT,
  result: { passed: false, score: 62, setAverages: [58, 62] },
  revisitNotes: ['Note A'],
  score: totalAt(62),
  note: 'retake',
  ...over,
});

const panel = (
  status:
    | ReturnType<typeof loaded>
    | Parameters<typeof computeDebriefPanel>[0]['status'],
  over: Partial<Parameters<typeof computeDebriefPanel>[0]> = {},
) =>
  computeDebriefPanel({
    status,
    finished: null,
    lessonSlug: LESSON,
    attemptInProgress: false,
    ...over,
  });

describe('computeDebriefPanel', () => {
  it('is loading until the status arrives', () => {
    expect(
      panel({
        isPending: true,
        isError: false,
        dataUpdatedAt: 0,
        data: undefined,
      }),
    ).toEqual({ kind: 'loading' });
  });

  it('is an error when the status failed with nothing to fall back on', () => {
    expect(
      panel({
        isPending: false,
        isError: true,
        dataUpdatedAt: 0,
        data: undefined,
      }),
    ).toEqual({ kind: 'error', refused: false, message: DEBRIEF_FAILED_COPY });
  });

  it.each([
    403, 404,
  ])('says the debrief is not available, with no retry, when the server refuses (%i)', (code) => {
    expect(
      panel({
        isPending: false,
        isError: true,
        error: new DebriefStatusError(code),
        dataUpdatedAt: 0,
        data: undefined,
      }),
    ).toEqual({ kind: 'error', refused: true, message: DEBRIEF_REFUSED_COPY });
  });

  it.each([
    ['a server failure', new DebriefStatusError(500)],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('blames the connection only for %s', (_why, error) => {
    expect(
      panel({
        isPending: false,
        isError: true,
        error,
        dataUpdatedAt: 0,
        data: undefined,
      }),
    ).toEqual({ kind: 'error', refused: false, message: DEBRIEF_FAILED_COPY });
  });

  it('keeps showing the last known state when only a background refetch failed', () => {
    expect(
      panel({
        isPending: false,
        isError: true,
        dataUpdatedAt: 1,
        data: {
          state: { kind: 'waiting', availableAt: AT },
          lessonOutstanding: [],
        },
      }),
    ).toEqual({ kind: 'waiting', availableAt: AT });
  });

  it('hands not-done the items still left to finish the lesson', () => {
    expect(
      panel(loaded({ kind: 'not-done' }, { lessonOutstanding: outstanding })),
    ).toEqual({ kind: 'not-done', outstanding });
  });

  it('hands waiting its opening time', () => {
    expect(panel(loaded({ kind: 'waiting', availableAt: AT }))).toEqual({
      kind: 'waiting',
      availableAt: AT,
    });
  });

  it.each([
    [false, false],
    [true, false],
    [true, true],
  ])('opens to take (retake=%s, resume=%s)', (retake, resume) => {
    expect(
      panel(loaded({ kind: 'open', retake, resume, passed: false })),
    ).toEqual({
      kind: 'take',
      retake,
      resume,
    });
  });

  it('an open attempt after a pass (a pending offer) is taken, resumed, not the pass history', () => {
    expect(
      panel(loaded({ kind: 'open', retake: true, resume: true, passed: true })),
    ).toEqual({ kind: 'take', retake: true, resume: true });
  });

  it('hands passed the attempts history, passing first as the server sent it', () => {
    const attempts = [historyAttempt(2, 100), historyAttempt(1, 40)];
    expect(panel(loaded({ kind: 'passed' }, { attempts }))).toEqual({
      kind: 'passed',
      attempts,
    });
  });

  it('treats a passed status with no attempts as an empty history, not a crash', () => {
    expect(panel(loaded({ kind: 'passed' }))).toEqual({
      kind: 'passed',
      attempts: [],
    });
  });

  describe('an attempt just finished on this lesson', () => {
    it('shows its report with no countdown: a failed attempt has no retake wait', () => {
      // Before the refetch lands the cached status still says open (resume)...
      expect(
        panel(
          loaded(
            { kind: 'open', retake: false, resume: true, passed: false },
            {},
            1,
          ),
          { finished: finished() },
        ),
      ).toEqual({ kind: 'finished', report: finished(), availableAt: null });
    });

    it('a pass has no countdown', () => {
      const passed = finished({
        result: { passed: true, score: 82, setAverages: [82] },
        revisitNotes: [],
      });
      expect(panel(loaded({ kind: 'passed' }), { finished: passed })).toEqual({
        kind: 'finished',
        report: passed,
        availableAt: null,
      });
    });

    it("another lesson's report is not shown here", () => {
      expect(
        panel(
          loaded({ kind: 'open', retake: true, resume: false, passed: false }),
          { finished: finished({ lessonSlug: 'another-lesson' }) },
        ),
      ).toEqual({ kind: 'take', retake: true, resume: false });
    });

    it('keeps the report when a status fetched after it says open for a retake', () => {
      // A failed attempt leaves the debrief open at once; that must not
      // dismiss the report the pilot has not yet read.
      expect(
        panel(
          loaded({ kind: 'open', retake: true, resume: false, passed: false }),
          { finished: finished() },
        ),
      ).toEqual({ kind: 'finished', report: finished(), availableAt: null });
    });
  });

  describe('an attempt in progress', () => {
    it('stays take when a refetch says the debrief is no longer open', () => {
      for (const state of [
        { kind: 'waiting', availableAt: AT },
        { kind: 'passed' },
        { kind: 'not-done' },
      ] satisfies DebriefState[]) {
        expect(panel(loaded(state), { attemptInProgress: true })).toEqual({
          kind: 'take',
          retake: false,
          resume: true,
        });
      }
    });
  });
});

const answered = (questionId: string, score: number, revisitNote = '') => ({
  questionId,
  score,
  feedback: '',
  revisitNote,
});

const attemptView = (
  over: Partial<DebriefAttemptView> = {},
): DebriefAttemptView => ({
  attemptId: 9,
  questions: [
    { id: 'q1', question: 'One?', set: 1 },
    { id: 'q2', question: 'Two?', set: 1 },
    { id: 'q3', question: 'Three?', set: 1 },
  ],
  answered: [],
  draft: null,
  offer: false,
  offerQuestionCount: 0,
  setResults: [],
  ...over,
});

/** Set 1 (q1–q4) answered and missed, so set 2 (q5–q6) has been revealed. */
const twoSets = (over: Partial<DebriefAttemptView> = {}) =>
  attemptView({
    questions: [
      ...['q1', 'q2', 'q3', 'q4'].map((id) => ({ id, question: id, set: 1 })),
      ...['q5', 'q6'].map((id) => ({ id, question: id, set: 2 })),
    ],
    answered: ['q1', 'q2', 'q3', 'q4'].map((id) => answered(id, 60)),
    ...over,
  });

describe('currentDebriefQuestion', () => {
  it('resumes at the first unanswered question, with its draft', () => {
    expect(
      currentDebriefQuestion(
        attemptView({
          answered: [answered('q1', 80)],
          draft: { questionId: 'q2', text: 'half an answer' },
        }),
      ),
    ).toEqual({
      question: { id: 'q2', question: 'Two?' },
      set: 1,
      index: 1,
      total: 3,
      draft: 'half an answer',
    });
  });

  it('counts its place within its own set, not across the attempt', () => {
    expect(currentDebriefQuestion(twoSets())).toMatchObject({
      question: { id: 'q5' },
      set: 2,
      index: 0,
      total: 2,
    });
  });

  it('ignores a draft saved for another question', () => {
    expect(
      currentDebriefQuestion(
        attemptView({ draft: { questionId: 'q3', text: 'later' } }),
      )?.draft,
    ).toBe('');
  });

  it('is null once every question shown is answered', () => {
    expect(
      currentDebriefQuestion(
        attemptView({
          answered: ['q1', 'q2', 'q3'].map((id) => answered(id, 50)),
        }),
      ),
    ).toBeNull();
  });
});

describe('questionPosition', () => {
  it('names the set and the place in it, counted from one', () => {
    expect(questionPosition({ set: 1, index: 1, total: 4 })).toBe(
      'Set 1 · Question 2 of 4',
    );
    expect(questionPosition({ set: 2, index: 0, total: 2 })).toBe(
      'Set 2 · Question 1 of 2',
    );
  });
});

describe('feedbackNextLabel', () => {
  const set1 = (passed: boolean) => ({
    set: 1,
    average: passed ? 80 : 40,
    passed,
    score: totalAt(passed ? 80 : 40),
  });
  const q5 = { id: 'q5', question: 'Five?', set: 2 };

  it('sends a finished attempt to its result, pass or not', () => {
    for (const finished of ['set-passed', 'sets-missed'] as const) {
      expect(
        feedbackNextLabel({
          finished,
          setResult: set1(finished === 'set-passed'),
          nextQuestions: [],
          offer: false,
        }),
      ).toBe('See your result');
    }
  });

  it('a missed set with another to come tries the other teaching points', () => {
    expect(
      feedbackNextLabel({
        finished: null,
        setResult: set1(false),
        nextQuestions: [q5],
        offer: false,
      }),
    ).toBe(DEBRIEF_SET1_MISSED_COPY);
  });

  it('a passed set with the improve offer continues to the offer', () => {
    expect(
      feedbackNextLabel({
        finished: null,
        setResult: set1(true),
        nextQuestions: [],
        offer: true,
      }),
    ).toBe('Continue');
  });

  it('is the next question mid-set', () => {
    expect(
      feedbackNextLabel({
        finished: null,
        setResult: null,
        nextQuestions: [],
        offer: false,
      }),
    ).toBe('Next question');
  });
});

describe('setAveragesOf', () => {
  it('averages each fully answered set, in set order, and skips one in progress', () => {
    expect(
      setAveragesOf(twoSets().questions, [
        answered('q1', 100),
        answered('q2', 50),
        answered('q3', 80),
        answered('q4', 41),
        answered('q5', 90),
      ]),
    ).toEqual([68]);
    expect(
      setAveragesOf(twoSets().questions, [
        ...['q1', 'q2', 'q3', 'q4'].map((id) => answered(id, 60)),
        answered('q5', 90),
        answered('q6', 70),
      ]),
    ).toEqual([60, 80]);
  });
});

describe('revisitNotesOf', () => {
  it('keeps non-empty notes once each, in question order, not answer order', () => {
    expect(
      revisitNotesOf(attemptView().questions, [
        { questionId: 'q3', revisitNote: 'Third note' },
        { questionId: 'q1', revisitNote: '  First note ' },
        { questionId: 'q2', revisitNote: '' },
        { questionId: 'q4', revisitNote: 'Not a question of this attempt' },
      ]),
    ).toEqual(['First note', 'Third note']);
  });

  it('drops a note repeated by a later answer', () => {
    expect(
      revisitNotesOf(attemptView().questions, [
        { questionId: 'q1', revisitNote: 'Same' },
        { questionId: 'q2', revisitNote: 'Same' },
      ]),
    ).toEqual(['Same']);
  });

  it('skips legacy evaluations with no note', () => {
    expect(
      revisitNotesOf(attemptView().questions, [{ questionId: 'q1' }]),
    ).toEqual([]);
  });
});

describe('finishedDebriefReport', () => {
  const result = (
    over: Partial<DebriefAnswerResult> = {},
  ): DebriefAnswerResult => ({
    evaluation: { score: 40, feedback: 'Viper says', revisitNote: 'Last note' },
    setResult: { set: 2, average: 65, passed: false, score: totalAt(65) },
    nextQuestions: [],
    offer: false,
    offerQuestionCount: 0,
    passedNow: false,
    finished: 'sets-missed',
    promotion: null,
    ...over,
  });

  it('reports each set average and every note of the attempt, the last answer included', () => {
    const attempt = twoSets({
      answered: [
        answered('q1', 90),
        answered('q2', 30, 'Second note'),
        answered('q3', 60),
        answered('q4', 60),
        answered('q5', 90),
      ],
    });
    expect(
      finishedDebriefReport({
        lessonSlug: LESSON,
        attempt,
        questionId: 'q6',
        result: result(),
        now: FINISHED_AT,
      }),
    ).toEqual({
      lessonSlug: LESSON,
      finishedAt: FINISHED_AT,
      result: { passed: false, score: 65, setAverages: [60, 65] },
      revisitNotes: ['Second note', 'Last note'],
      score: totalAt(65),
      note: 'retake',
    });
  });

  it('set-passed is a pass at the set average with nothing to revisit', () => {
    expect(
      finishedDebriefReport({
        lessonSlug: LESSON,
        attempt: attemptView({
          questions: ['q1', 'q2'].map((id) => ({ id, question: id, set: 1 })),
          answered: [answered('q1', 70, 'Old')],
        }),
        questionId: 'q2',
        result: result({
          evaluation: { score: 90, feedback: 'Good', revisitNote: '' },
          setResult: { set: 1, average: 80, passed: true, score: totalAt(80) },
          finished: 'set-passed',
        }),
        now: FINISHED_AT,
      }),
    ).toEqual({
      lessonSlug: LESSON,
      finishedAt: FINISHED_AT,
      result: { passed: true, score: 80, setAverages: [80] },
      revisitNotes: [],
      score: totalAt(80),
      note: null,
    });
  });

  it('a pass is final: set-passed reads as a pass with no retake, even when the set itself was judged a miss', () => {
    // The pilot already held a pass and today's facts dropped: set 2 is
    // judged a miss, yet the attempt finishes set-passed.
    const report = finishedDebriefReport({
      lessonSlug: LESSON,
      attempt: twoSets({
        answered: [
          ...['q1', 'q2', 'q3', 'q4'].map((id) => answered(id, 50)),
          answered('q5', 10),
        ],
      }),
      questionId: 'q6',
      result: result({
        setResult: { set: 2, average: 50, passed: false, score: totalAt(50) },
        finished: 'set-passed',
      }),
      now: FINISHED_AT,
    });
    expect(report?.result.passed).toBe(true);
    expect(report?.note).toBeNull();
    expect(report?.revisitNotes).toEqual([]);
  });

  it('is null while the attempt goes on', () => {
    expect(
      finishedDebriefReport({
        lessonSlug: LESSON,
        attempt: attemptView(),
        questionId: 'q1',
        result: result({ finished: null, setResult: null }),
        now: FINISHED_AT,
      }),
    ).toBeNull();
  });
});

describe('declinedDebriefReport', () => {
  it('No to the offer is a pass at set 1, with its total and the decline note', () => {
    const attempt = attemptView({
      questions: ['q1', 'q2', 'q3', 'q4'].map((id) => ({
        id,
        question: id,
        set: 1,
      })),
      answered: ['q1', 'q2', 'q3', 'q4'].map((id) => answered(id, 80, 'n')),
      offer: true,
      offerQuestionCount: 4,
      setResults: [{ set: 1, average: 80, passed: true, score: totalAt(80) }],
    });
    expect(
      declinedDebriefReport({ lessonSlug: LESSON, attempt, now: FINISHED_AT }),
    ).toEqual({
      lessonSlug: LESSON,
      finishedAt: FINISHED_AT,
      result: { passed: true, score: 80, setAverages: [80] },
      revisitNotes: [],
      score: totalAt(80),
      note: 'declined',
    });
  });
});

describe('continueErrorCopy', () => {
  it('a 4xx (no offer any more, or refused) says the debrief was reloaded', () => {
    for (const status of [403, 409]) {
      expect(continueErrorCopy(new DebriefRequestError('x', status))).toBe(
        DEBRIEF_CONTINUE_REFUSED_COPY,
      );
    }
  });

  it('a 5xx or network failure blames the connection', () => {
    expect(continueErrorCopy(new DebriefRequestError('x', 500))).toBe(
      DEBRIEF_CONTINUE_FAILED_COPY,
    );
    expect(continueErrorCopy(new TypeError('fetch'))).toBe(
      DEBRIEF_CONTINUE_FAILED_COPY,
    );
  });
});

describe('debriefQuizView', () => {
  const base = {
    readOnly: false,
    enabled: true,
    resume: false,
    notOpen: null,
    hasAttempt: false,
    startError: null,
    hasCurrent: false,
    hasFeedback: false,
    hasOffer: false,
  } as const;

  it("Viper's feedback stands in for the next question, and for scoring", () => {
    for (const hasCurrent of [true, false]) {
      expect(
        debriefQuizView({
          ...base,
          hasAttempt: true,
          hasCurrent,
          hasFeedback: true,
        }),
      ).toBe('feedback');
    }
  });

  it('a refusal or a 409 still wins over feedback', () => {
    expect(
      debriefQuizView({
        ...base,
        hasAttempt: true,
        hasFeedback: true,
        startError: 'refused',
      }),
    ).toBe('refused');
    expect(
      debriefQuizView({
        ...base,
        hasAttempt: true,
        hasFeedback: true,
        notOpen: { availableAt: AT },
      }),
    ).toBe('not-open-countdown');
  });

  it('a 409 on a fresh Start shows the countdown, never the intro (Start pressed state cleared)', () => {
    expect(
      debriefQuizView({
        ...base,
        enabled: false,
        notOpen: { availableAt: AT },
      }),
    ).toBe('not-open-countdown');
  });

  it('a 409 with no time says it is checking, never the intro', () => {
    expect(
      debriefQuizView({
        ...base,
        enabled: false,
        notOpen: { availableAt: null },
      }),
    ).toBe('not-open-checking');
  });

  it('not-open wins over a loaded attempt', () => {
    expect(
      debriefQuizView({
        ...base,
        hasAttempt: true,
        hasCurrent: true,
        notOpen: { availableAt: AT },
      }),
    ).toBe('not-open-countdown');
  });

  it('read-only is the inert intro, whatever else holds', () => {
    expect(
      debriefQuizView({
        ...base,
        readOnly: true,
        notOpen: { availableAt: AT },
      }),
    ).toBe('read-only');
  });

  it.each([
    [{ enabled: false }, 'intro'],
    [{ startError: 'no-source' }, 'no-source'],
    [{ startError: 'failed' }, 'start-failed'],
    [{ startError: 'preparing' }, 'preparing'],
    [{ startError: 'preparing-stalled' }, 'preparing-stalled'],
    [{ startError: 'refused' }, 'refused'],
    [{}, 'starting'],
    [{ resume: true }, 'resuming'],
    [{ hasAttempt: true }, 'scoring'],
    [{ hasAttempt: true, hasCurrent: true }, 'question'],
    // A pending offer (resume, or Continue on the passing set's feedback).
    [{ hasAttempt: true, hasOffer: true }, 'offer'],
    [{ hasAttempt: true, hasOffer: true, hasFeedback: true }, 'feedback'],
  ] as const)('%o → %s', (over, view) => {
    expect(debriefQuizView({ ...base, ...over })).toBe(view);
  });
});

describe('debriefQuizView refusals mid-attempt', () => {
  it('a refused (403) start wins over a loaded attempt — never "check your connection", never the stale question', () => {
    expect(
      debriefQuizView({
        readOnly: false,
        enabled: true,
        resume: true,
        notOpen: null,
        hasAttempt: true,
        startError: 'refused',
        hasCurrent: true,
        hasFeedback: false,
        hasOffer: false,
      }),
    ).toBe('refused');
  });
});

describe('startErrorOf', () => {
  it.each([
    ['nothing wrong', { error: null, failureReason: null }, null],
    [
      'a 503 being retried',
      { error: null, failureReason: new DebriefPreparingError() },
      'preparing',
    ],
    [
      'a 503 after the retries ran out',
      {
        error: new DebriefPreparingError(),
        failureReason: new DebriefPreparingError(),
      },
      'preparing-stalled',
    ],
    [
      'a 422',
      { error: new DebriefNoSourceError(), failureReason: null },
      'no-source',
    ],
    [
      'a 403',
      { error: new DebriefRequestError('x', 403), failureReason: null },
      'refused',
    ],
    [
      'a 404',
      { error: new DebriefRequestError('x', 404), failureReason: null },
      'refused',
    ],
    [
      'a 500',
      { error: new DebriefRequestError('x', 500), failureReason: null },
      'failed',
    ],
    [
      'a network failure',
      { error: new TypeError('fetch'), failureReason: null },
      'failed',
    ],
    [
      'a 409 (handled as not-open, not here)',
      { error: new DebriefNotOpenError(null), failureReason: null },
      null,
    ],
  ] as const)('%s → %s', (_n, input, kind) => {
    expect(startErrorOf(input)).toBe(kind);
  });
});

describe('answerErrorCopy', () => {
  it('a 403/404 states that the attempt closed or access was lost — not the connection', () => {
    for (const status of [403, 404]) {
      const copy = answerErrorCopy(new DebriefRequestError('x', status));
      expect(copy).toBe(DEBRIEF_ANSWER_FORBIDDEN_COPY);
      expect(copy).not.toMatch(/connection/i);
    }
  });

  it('another 4xx says the attempt was reloaded', () => {
    expect(answerErrorCopy(new DebriefRequestError('x', 400))).toBe(
      DEBRIEF_ANSWER_REFUSED_COPY,
    );
  });

  it('a 5xx or network failure blames the connection', () => {
    expect(answerErrorCopy(new DebriefRequestError('x', 500))).toBe(
      DEBRIEF_ANSWER_FAILED_COPY,
    );
    expect(answerErrorCopy(new TypeError('fetch'))).toBe(
      DEBRIEF_ANSWER_FAILED_COPY,
    );
  });
});

describe('countdownTarget', () => {
  it('the 12 h wait is re-checked when it opens', () => {
    expect(countdownTarget({ kind: 'waiting', availableAt: AT })).toBe(AT);
  });

  it('a finished report has nothing to count down to', () => {
    expect(
      countdownTarget({
        kind: 'finished',
        report: finished(),
        availableAt: null,
      }),
    ).toBeNull();
  });
});

describe('attemptFormat', () => {
  it("an attempt whose answers carry Viper's feedback is a set attempt", () => {
    expect(
      attemptFormat([
        { questionId: 'q1', score: 80, revisitNote: '', feedback: 'Good' },
        { questionId: 'q2', score: 30, revisitNote: 'n', feedback: 'Missed' },
      ]),
    ).toBe('sets');
  });

  it('an attempt whose answers carry revisit notes is a chunk attempt', () => {
    expect(
      attemptFormat([
        { questionId: 'q1', score: 80, revisitNote: '' },
        { questionId: 'q2', score: 30, revisitNote: 'n' },
      ]),
    ).toBe('chunk');
  });

  it('an attempt with no revisit notes at all is legacy', () => {
    expect(attemptFormat([{ questionId: 'm1', score: 100 }])).toBe('legacy');
    expect(attemptFormat([])).toBe('legacy');
  });
});
