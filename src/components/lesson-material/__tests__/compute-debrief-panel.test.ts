import { describe, expect, it } from 'vitest';
import type {
  DebriefAnswerResult,
  DebriefAttemptView,
} from '#/data-hooks/use-debrief-attempt';
import {
  type DebriefStatus,
  DebriefStatusError,
} from '#/data-hooks/use-debrief-status';
import { revisitNotesOf } from '#/lib/client-debrief-attempt';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import {
  DEBRIEF_RETAKE_DELAY_MS,
  type DebriefState,
} from '#/lib/debrief-schedule';
import {
  attemptFormat,
  computeDebriefPanel,
  countdownTarget,
  currentDebriefQuestion,
  DEBRIEF_FAILED_COPY,
  DEBRIEF_REFUSED_COPY,
  debriefQuizView,
  type FinishedDebrief,
  finishedDebriefReport,
  isStaleFinishedDebrief,
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

const finished = (over: Partial<FinishedDebrief> = {}): FinishedDebrief => ({
  lessonSlug: LESSON,
  finishedAt: FINISHED_AT,
  mastery: { cleared: 5, total: 7, percent: 71, passed: false },
  revisitNotes: ['Note A'],
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
    expect(panel(loaded({ kind: 'open', retake, resume }))).toEqual({
      kind: 'take',
      retake,
      resume,
      clearedSome: false,
    });
  });

  it.each([
    [{ cleared: 2, total: 5, percent: 40 }, true],
    [{ cleared: 0, total: 5, percent: 0 }, false],
    [null, false],
  ])('a retake says it mixes in cleared chunks only when some are cleared (%o)', (mastery, clearedSome) => {
    expect(
      panel(
        loaded(
          { kind: 'open', retake: true, resume: false },
          { mastery, revisitNotes: [] },
        ),
      ),
    ).toEqual({ kind: 'take', retake: true, resume: false, clearedSome });
  });

  it('retake-waiting shows the report from the status payload — mastery and notes — with the time the next attempt opens', () => {
    expect(
      panel(
        loaded(
          { kind: 'retake-waiting', availableAt: AT },
          {
            mastery: { cleared: 5, total: 7, percent: 71 },
            revisitNotes: ['Note A', 'Note B'],
          },
        ),
      ),
    ).toEqual({
      kind: 'retake-waiting',
      availableAt: AT,
      report: {
        mastery: { cleared: 5, total: 7, percent: 71, passed: false },
        revisitNotes: ['Note A', 'Note B'],
      },
    });
  });

  it('retake-waiting with no chunk mastery (legacy attempts only) is the countdown alone', () => {
    expect(
      panel(
        loaded(
          { kind: 'retake-waiting', availableAt: AT },
          { mastery: null, revisitNotes: [] },
        ),
      ),
    ).toEqual({ kind: 'retake-waiting', availableAt: AT, report: null });
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
    it('shows its report with the countdown to the time the server gives', () => {
      expect(
        panel(loaded({ kind: 'retake-waiting', availableAt: AT }), {
          finished: finished(),
        }),
      ).toEqual({ kind: 'finished', report: finished(), availableAt: AT });
    });

    it('counts down from its own finish while the status still says open', () => {
      // The refetch that follows the last answer has not landed yet.
      expect(
        panel(loaded({ kind: 'open', retake: false, resume: true }, {}, 1), {
          finished: finished(),
        }),
      ).toEqual({
        kind: 'finished',
        report: finished(),
        availableAt: new Date(
          FINISHED_AT + DEBRIEF_RETAKE_DELAY_MS,
        ).toISOString(),
      });
    });

    it('a pass has no countdown', () => {
      const passed = finished({
        mastery: { cleared: 7, total: 7, percent: 100, passed: true },
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
        panel(loaded({ kind: 'retake-waiting', availableAt: AT }), {
          finished: finished({ lessonSlug: 'another-lesson' }),
        }),
      ).toEqual({ kind: 'retake-waiting', availableAt: AT, report: null });
    });

    it('gives way to the fresh debrief once a status fetched after it says open', () => {
      expect(
        panel(loaded({ kind: 'open', retake: true, resume: false }), {
          finished: finished(),
        }),
      ).toEqual({
        kind: 'take',
        retake: true,
        resume: false,
        clearedSome: false,
      });
    });
  });

  describe('an attempt in progress', () => {
    it('stays take when a refetch says the debrief is no longer open', () => {
      for (const state of [
        { kind: 'retake-waiting', availableAt: AT },
        { kind: 'waiting', availableAt: AT },
        { kind: 'passed' },
        { kind: 'not-done' },
      ] satisfies DebriefState[]) {
        expect(panel(loaded(state), { attemptInProgress: true })).toEqual({
          kind: 'take',
          retake: false,
          resume: true,
          clearedSome: false,
        });
      }
    });
  });
});

describe('isStaleFinishedDebrief', () => {
  it('is stale only for this lesson, with an open status fetched after the finish', () => {
    const open = loaded({ kind: 'open', retake: true, resume: false });
    expect(isStaleFinishedDebrief(finished(), LESSON, open)).toBe(true);
    expect(
      isStaleFinishedDebrief(finished(), LESSON, {
        ...open,
        dataUpdatedAt: FINISHED_AT - 1,
      }),
    ).toBe(false);
    expect(isStaleFinishedDebrief(finished(), 'other', open)).toBe(false);
    expect(isStaleFinishedDebrief(null, LESSON, open)).toBe(false);
    expect(
      isStaleFinishedDebrief(
        finished(),
        LESSON,
        loaded({ kind: 'retake-waiting', availableAt: AT }),
      ),
    ).toBe(false);
  });
});

const attemptView = (
  over: Partial<DebriefAttemptView> = {},
): DebriefAttemptView => ({
  attemptId: 9,
  questions: [
    { id: 'q1', question: 'One?' },
    { id: 'q2', question: 'Two?' },
    { id: 'q3', question: 'Three?' },
  ],
  answered: [],
  draft: null,
  ...over,
});

describe('currentDebriefQuestion', () => {
  it('resumes at the first unanswered question, with its draft', () => {
    expect(
      currentDebriefQuestion(
        attemptView({
          answered: [{ questionId: 'q1', score: 80, revisitNote: '' }],
          draft: { questionId: 'q2', text: 'half an answer' },
        }),
      ),
    ).toEqual({
      question: { id: 'q2', question: 'Two?' },
      index: 1,
      total: 3,
      draft: 'half an answer',
    });
  });

  it('ignores a draft saved for another question', () => {
    expect(
      currentDebriefQuestion(
        attemptView({ draft: { questionId: 'q3', text: 'later' } }),
      )?.draft,
    ).toBe('');
  });

  it('is null once every question is answered', () => {
    expect(
      currentDebriefQuestion(
        attemptView({
          answered: ['q1', 'q2', 'q3'].map((questionId) => ({
            questionId,
            score: 50,
            revisitNote: '',
          })),
        }),
      ),
    ).toBeNull();
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
    evaluation: { score: 40, revisitNote: 'Last note' },
    mastery: { cleared: 2, total: 3, percent: 67 },
    finished: 'all-answered',
    promotion: null,
    ...over,
  });

  it('reports mastery and every note of the attempt, the last answer included', () => {
    const attempt = attemptView({
      answered: [
        { questionId: 'q1', score: 90, revisitNote: '' },
        { questionId: 'q2', score: 30, revisitNote: 'Second note' },
      ],
    });
    expect(
      finishedDebriefReport({
        lessonSlug: LESSON,
        attempt,
        questionId: 'q3',
        result: result(),
        now: FINISHED_AT,
      }),
    ).toEqual({
      lessonSlug: LESSON,
      finishedAt: FINISHED_AT,
      mastery: { cleared: 2, total: 3, percent: 67, passed: false },
      revisitNotes: ['Second note', 'Last note'],
    });
  });

  it('all-cleared is a pass at 100 with nothing to revisit', () => {
    expect(
      finishedDebriefReport({
        lessonSlug: LESSON,
        attempt: attemptView({
          answered: [{ questionId: 'q1', score: 30, revisitNote: 'Old' }],
        }),
        questionId: 'q2',
        result: result({
          mastery: { cleared: 3, total: 3, percent: 100 },
          finished: 'all-cleared',
        }),
        now: FINISHED_AT,
      }),
    ).toEqual({
      lessonSlug: LESSON,
      finishedAt: FINISHED_AT,
      mastery: { cleared: 3, total: 3, percent: 100, passed: true },
      revisitNotes: [],
    });
  });

  it('is null while the attempt goes on', () => {
    expect(
      finishedDebriefReport({
        lessonSlug: LESSON,
        attempt: attemptView(),
        questionId: 'q1',
        result: result({ finished: null }),
        now: FINISHED_AT,
      }),
    ).toBeNull();
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
  } as const;

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
    [{}, 'starting'],
    [{ resume: true }, 'resuming'],
    [{ hasAttempt: true }, 'scoring'],
    [{ hasAttempt: true, hasCurrent: true }, 'question'],
  ] as const)('%o → %s', (over, view) => {
    expect(debriefQuizView({ ...base, ...over })).toBe(view);
  });
});

describe('countdownTarget', () => {
  it('a finished report keeps one announcement key while its time is corrected by the server', () => {
    const before = countdownTarget({
      kind: 'finished',
      report: finished(),
      availableAt: '2026-10-28T15:40:00.000Z',
    });
    const after = countdownTarget({
      kind: 'finished',
      report: finished(),
      availableAt: '2026-10-28T15:40:01.234Z',
    });
    expect(before.announceKey).toBe(after.announceKey);
    expect(after.availableAt).toBe('2026-10-28T15:40:01.234Z');
  });

  it('the 12 h wait refetches when it opens but announces no retake countdown', () => {
    expect(countdownTarget({ kind: 'waiting', availableAt: AT })).toEqual({
      availableAt: AT,
      announceKey: null,
    });
  });

  it('retake-waiting counts down and announces', () => {
    expect(
      countdownTarget({
        kind: 'retake-waiting',
        availableAt: AT,
        report: null,
      }),
    ).toEqual({ availableAt: AT, announceKey: `retake:${AT}` });
  });

  it('a pass has nothing to count down to', () => {
    expect(
      countdownTarget({
        kind: 'finished',
        report: finished(),
        availableAt: null,
      }),
    ).toEqual({ availableAt: null, announceKey: null });
  });
});

describe('attemptFormat', () => {
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
