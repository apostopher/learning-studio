import { describe, expect, it } from 'vitest';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import type { DebriefState } from '#/lib/debrief-schedule';
import type {
  DebriefStatusAttempt,
  DebriefStatusResponse,
} from '#/routes/api/lesson/debrief-status';
import {
  computeDebriefPanel,
  debriefSessionProgress,
  isStaleDebriefSession,
  settleDebriefPanel,
} from '../compute-debrief-panel';

const LESSON = 'radio-calls';
const AT = '2026-10-28T15:40:00.000Z';

const outstanding: OutstandingItem[] = [
  { kind: 'video' },
  { kind: 'section', section: 'links' },
];

const attempt = (id: number, totalScore: number): DebriefStatusAttempt => ({
  id,
  totalScore,
  completedAt: '2026-10-27T10:00:00.000Z',
  passed: totalScore >= 70,
  questions: [],
  evaluations: [],
});

const loaded = (
  state: DebriefState,
  extra: Partial<DebriefStatusResponse> = {},
) => ({
  isPending: false,
  isError: false,
  data: { state, lessonOutstanding: [], ...extra },
});

const panel = (
  status:
    | ReturnType<typeof loaded>
    | Parameters<typeof computeDebriefPanel>[0]['status'],
  over: Partial<Parameters<typeof computeDebriefPanel>[0]> = {},
) =>
  computeDebriefPanel({
    status,
    justSubmittedLessonSlug: null,
    lessonSlug: LESSON,
    sessionInProgress: false,
    ...over,
  });

describe('computeDebriefPanel', () => {
  it('is loading until the status arrives', () => {
    expect(panel({ isPending: true, isError: false, data: undefined })).toEqual(
      { kind: 'loading' },
    );
  });

  it('is an error when the status failed with nothing to fall back on', () => {
    expect(panel({ isPending: false, isError: true, data: undefined })).toEqual(
      { kind: 'error' },
    );
  });

  it('keeps showing the last known state when only a background refetch failed', () => {
    expect(
      panel({
        isPending: false,
        isError: true,
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

  it.each([false, true])('opens to take (retake=%s)', (retake) => {
    expect(panel(loaded({ kind: 'open', retake }))).toEqual({
      kind: 'take',
      retake,
    });
  });

  it('shows the just-submitted attempt when the below-par save was this lesson (call 2)', () => {
    expect(
      panel(loaded({ kind: 'retake-waiting', availableAt: AT }), {
        justSubmittedLessonSlug: LESSON,
      }),
    ).toEqual({ kind: 'just-failed', availableAt: AT });
  });

  it('shows ONLY the reopen time when the attempt submitted this session was another lesson', () => {
    expect(
      panel(loaded({ kind: 'retake-waiting', availableAt: AT }), {
        justSubmittedLessonSlug: 'another-lesson',
      }),
    ).toEqual({ kind: 'retake-waiting', availableAt: AT });
  });

  it('shows ONLY the reopen time on a later visit, with nothing submitted this session', () => {
    expect(panel(loaded({ kind: 'retake-waiting', availableAt: AT }))).toEqual({
      kind: 'retake-waiting',
      availableAt: AT,
    });
  });

  it('hands passed the attempts history, passing first as the server sent it', () => {
    const attempts = [attempt(2, 85), attempt(1, 40)];
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

  describe('a debrief in progress', () => {
    it('stays take when a refetch says the debrief is no longer open', () => {
      // The 24h clock is the server's; a window refocus refetch must not yank
      // a half-answered debrief out from under the pilot.
      for (const state of [
        { kind: 'retake-waiting', availableAt: AT },
        { kind: 'waiting', availableAt: AT },
        { kind: 'passed' },
        { kind: 'not-done' },
      ] satisfies DebriefState[]) {
        expect(panel(loaded(state), { sessionInProgress: true }).kind).toBe(
          'take',
        );
      }
    });

    it('stays take while the status is refetching from scratch', () => {
      expect(
        panel(
          { isPending: true, isError: false, data: undefined },
          { sessionInProgress: true },
        ).kind,
      ).toBe('take');
    });

    it('keeps the retake flag the status gave it', () => {
      expect(
        panel(loaded({ kind: 'open', retake: true }), {
          sessionInProgress: true,
        }),
      ).toEqual({ kind: 'take', retake: true });
    });
  });
});

describe('debriefSessionProgress', () => {
  const session = { lessonSlug: LESSON, questions: [{}, {}] };

  it('is none with no session, or a session for another lesson', () => {
    expect(debriefSessionProgress(null, 0, LESSON)).toBe('none');
    expect(
      debriefSessionProgress({ ...session, lessonSlug: 'other' }, 2, LESSON),
    ).toBe('none');
  });

  it('is in-progress until every question is evaluated', () => {
    expect(debriefSessionProgress(session, 0, LESSON)).toBe('in-progress');
    expect(debriefSessionProgress(session, 1, LESSON)).toBe('in-progress');
  });

  it('is complete once every question is evaluated', () => {
    expect(debriefSessionProgress(session, 2, LESSON)).toBe('complete');
  });
});

describe('isStaleDebriefSession', () => {
  const base = {
    sessionProgress: 'complete' as const,
    sessionSaved: true,
    status: {
      isFetching: false,
      data: loaded({ kind: 'open', retake: true }).data,
    },
  };

  it('is stale once the debrief has reopened after this session was saved', () => {
    // The page stayed open through the 24h wait: the old score report would
    // otherwise sit where the fresh debrief's Start belongs, with no way on.
    // Keyed on the save, not on the just-submitted marker — that is cleared
    // on leaving the lesson, and the saved session outlives it.
    expect(isStaleDebriefSession(base)).toBe(true);
  });

  it('is not stale while the post-save refetch is still in flight', () => {
    // Between the save and its refetch the cached status still says open —
    // that is the old status, not a reopening.
    expect(
      isStaleDebriefSession({
        ...base,
        status: { ...base.status, isFetching: true },
      }),
    ).toBe(false);
  });

  it('is not stale for a session not yet complete, or not (yet) saved', () => {
    expect(
      isStaleDebriefSession({ ...base, sessionProgress: 'in-progress' }),
    ).toBe(false);
    // Saving, or failed: the report is the only place the retry lives.
    expect(isStaleDebriefSession({ ...base, sessionSaved: false })).toBe(false);
  });

  it('is not stale while the debrief is still closed or passed', () => {
    for (const state of [
      { kind: 'retake-waiting', availableAt: AT },
      { kind: 'passed' },
    ] satisfies DebriefState[]) {
      expect(
        isStaleDebriefSession({
          ...base,
          status: { isFetching: false, data: loaded(state).data },
        }),
      ).toBe(false);
    }
  });
});

describe('settleDebriefPanel', () => {
  it('mounts nothing that could re-save while a stale session is being cleared', () => {
    // DebriefQuizContainer auto-saves a complete session on mount, and a
    // child's effect runs before its parent's reset — so rendering it here
    // would record the old attempt a second time, against the reopened
    // debrief, and re-lock it for another 24h.
    expect(
      settleDebriefPanel(
        { kind: 'take', retake: true },
        { sessionProgress: 'complete', stale: true },
      ),
    ).toEqual({ kind: 'loading' });
  });

  it('falls back to only the reopen time when the just-submitted session is no longer in memory', () => {
    expect(
      settleDebriefPanel(
        { kind: 'just-failed', availableAt: AT },
        { sessionProgress: 'none', stale: false },
      ),
    ).toEqual({ kind: 'retake-waiting', availableAt: AT });
  });

  it('keeps just-failed when the submitted session is there to report', () => {
    expect(
      settleDebriefPanel(
        { kind: 'just-failed', availableAt: AT },
        { sessionProgress: 'complete', stale: false },
      ),
    ).toEqual({ kind: 'just-failed', availableAt: AT });
  });

  it('passes every other panel through', () => {
    expect(
      settleDebriefPanel(
        { kind: 'waiting', availableAt: AT },
        { sessionProgress: 'none', stale: false },
      ),
    ).toEqual({ kind: 'waiting', availableAt: AT });
  });
});
