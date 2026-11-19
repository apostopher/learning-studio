import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import {
  applyAnswerResult,
  type DebriefAttemptView,
  DebriefNoSourceError,
  DebriefNotOpenError,
  DebriefPreparingError,
  DebriefRequestError,
  fetchStartDebrief,
  postDebriefAnswer,
  postDebriefDraft,
  preparingRetry,
  preparingRetryDelay,
  withAnswerRecorded,
} from '#/data-hooks/use-debrief-attempt';

afterEach(() => vi.unstubAllGlobals());

const lesson = { courseSlug: 'ppl', lessonSlug: 'l1' };
const metrics = {
  msOnQuestion: 1,
  msToFirstKey: 1,
  deletions: 0,
  charsDeleted: 0,
  rewrites: 0,
  pasteBlocked: 0,
  msHidden: 0,
  finalLength: 3,
};
const stub = (status: number, body: unknown = {}) => {
  const f = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', f);
  return f;
};
const attempt: DebriefAttemptView = {
  attemptId: 7,
  questions: [
    { id: 'q1', question: 'A?', set: 1 },
    { id: 'q2', question: 'B?', set: 1 },
  ],
  answered: [],
  draft: { questionId: 'q1', text: 'half' },
};

describe('debrief attempt requests', () => {
  it('start posts both slugs and parses the attempt', async () => {
    const f = stub(200, attempt);
    expect(await fetchStartDebrief(lesson)).toEqual(attempt);
    expect(f.mock.calls[0][0]).toBe('/api/lesson/debrief/start');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual(lesson);
  });

  it('start 409 carries availableAt and the promotion', async () => {
    const promotion = { id: 3, from: 'basic', to: 'intermediate' };
    stub(409, {
      error: 'not-open',
      availableAt: '2026-01-01T00:00:00Z',
      promotion,
    });
    const e = await fetchStartDebrief(lesson).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DebriefNotOpenError);
    expect((e as DebriefNotOpenError).availableAt).toBe('2026-01-01T00:00:00Z');
    expect((e as DebriefNotOpenError).promotion).toEqual(promotion);
  });

  it('start 503 is a preparing error (chunks still being generated), not a failure', async () => {
    stub(503, { error: 'preparing', retryable: true });
    await expect(fetchStartDebrief(lesson)).rejects.toBeInstanceOf(
      DebriefPreparingError,
    );
  });

  it('start 403 carries its status, so the view can say it is refused', async () => {
    stub(403);
    const e = await fetchStartDebrief(lesson).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DebriefRequestError);
    expect((e as DebriefRequestError).status).toBe(403);
  });

  it('retries only a preparing start, a bounded number of times, backing off', () => {
    const preparing = new DebriefPreparingError();
    expect(preparingRetry(0, preparing)).toBe(true);
    expect(preparingRetry(4, preparing)).toBe(true);
    expect(preparingRetry(5, preparing)).toBe(false);
    expect(preparingRetry(0, new DebriefNoSourceError())).toBe(false);
    expect(preparingRetry(0, new DebriefRequestError('x', 500))).toBe(false);
    expect([0, 1, 2, 3, 4, 5].map(preparingRetryDelay)).toEqual([
      1000, 2000, 4000, 8000, 8000, 8000,
    ]);
  });

  it('start 422 is a no-source error', async () => {
    stub(422);
    await expect(fetchStartDebrief(lesson)).rejects.toBeInstanceOf(
      DebriefNoSourceError,
    );
  });

  it('answer posts the exact body the route validates, and returns the promotion', async () => {
    const f = stub(200, {
      evaluation: { score: 80, feedback: 'Good', revisitNote: '' },
      setResult: null,
      nextQuestions: [],
      finished: null,
      promotion: { id: 1, from: 'basic', to: 'intermediate' },
    });
    const r = await postDebriefAnswer({
      ...lesson,
      attemptId: 7,
      questionId: 'q1',
      answer: 'abc',
      metrics,
    });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      courseSlug: 'ppl',
      attemptId: 7,
      questionId: 'q1',
      answer: 'abc',
      metrics,
    });
    expect(r.promotion?.to).toBe('intermediate');
  });

  it('draft posts attemptId, questionId and text', async () => {
    const f = stub(204);
    await postDebriefDraft({ attemptId: 7, questionId: 'q1', text: 'x' });
    expect(f.mock.calls[0][0]).toBe('/api/lesson/debrief/draft');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      attemptId: 7,
      questionId: 'q1',
      text: 'x',
    });
  });

  it('a recorded answer reaches the attempt cache with its feedback; status and progress are invalidated', async () => {
    const qc = new QueryClient();
    qc.setQueryData(dataKeys.debriefAttempt('l1'), attempt);
    const spy = vi.spyOn(qc, 'invalidateQueries');
    await applyAnswerResult(
      qc,
      { ...lesson, attemptId: 7, questionId: 'q1', answer: 'abc', metrics },
      {
        evaluation: { score: 80, feedback: 'Viper says', revisitNote: 'n' },
        setResult: null,
        nextQuestions: [],
        finished: null,
        promotion: null,
      },
    );
    const cached = qc.getQueryData<DebriefAttemptView>(
      dataKeys.debriefAttempt('l1'),
    );
    expect(cached?.answered).toEqual([
      { questionId: 'q1', score: 80, feedback: 'Viper says', revisitNote: 'n' },
    ]);
    expect(cached?.draft).toBeNull();
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(dataKeys.debriefStatus('ppl', 'l1'));
    expect(keys).toContainEqual(dataKeys.courseProgressSummary('ppl'));
  });
});

describe('withAnswerRecorded', () => {
  const result = (nextQuestions: DebriefAttemptView['questions']) => ({
    evaluation: { score: 60, feedback: 'f', revisitNote: 'r' },
    setResult: { set: 1, average: 60, passed: false },
    nextQuestions,
    finished: null,
    promotion: null,
  });

  it('appends the set a missed set opened, after the questions already shown', () => {
    const next = withAnswerRecorded(
      attempt,
      'q2',
      result([
        { id: 'q3', question: 'C?', set: 2 },
        { id: 'q4', question: 'D?', set: 2 },
      ]),
    );
    expect(next.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });

  it('never adds a question twice when the same result is applied again', () => {
    const opened = result([{ id: 'q3', question: 'C?', set: 2 }]);
    const once = withAnswerRecorded(attempt, 'q2', opened);
    const twice = withAnswerRecorded(once, 'q2', opened);
    expect(twice.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(twice.answered).toHaveLength(1);
  });
});
