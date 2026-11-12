import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import {
  applyAnswerResult,
  type DebriefAttemptView,
  DebriefNoSourceError,
  DebriefNotOpenError,
  fetchStartDebrief,
  postDebriefAnswer,
  postDebriefDraft,
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
    { id: 'q1', question: 'A?' },
    { id: 'q2', question: 'B?' },
  ],
  answered: [],
  draft: { questionId: 'q1', text: 'half' },
  mastery: { cleared: 0, total: 4 },
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

  it('start 422 is a no-source error', async () => {
    stub(422);
    await expect(fetchStartDebrief(lesson)).rejects.toBeInstanceOf(
      DebriefNoSourceError,
    );
  });

  it('answer posts the exact body the route validates, and returns the promotion', async () => {
    const f = stub(200, {
      evaluation: { score: 80, revisitNote: '' },
      mastery: { cleared: 2, total: 4, percent: 50 },
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

  it('a recorded answer reaches the attempt cache; status and progress are invalidated', async () => {
    const qc = new QueryClient();
    qc.setQueryData(dataKeys.debriefAttempt('l1'), attempt);
    const spy = vi.spyOn(qc, 'invalidateQueries');
    await applyAnswerResult(
      qc,
      { ...lesson, attemptId: 7, questionId: 'q1', answer: 'abc', metrics },
      {
        evaluation: { score: 80, revisitNote: 'n' },
        mastery: { cleared: 2, total: 4, percent: 50 },
        finished: null,
        promotion: null,
      },
    );
    const cached = qc.getQueryData<DebriefAttemptView>(
      dataKeys.debriefAttempt('l1'),
    );
    expect(cached?.answered).toEqual([
      { questionId: 'q1', score: 80, revisitNote: 'n' },
    ]);
    expect(cached?.draft).toBeNull();
    expect(cached?.mastery).toEqual({ cleared: 2, total: 4 });
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(dataKeys.debriefStatus('ppl', 'l1'));
    expect(keys).toContainEqual(dataKeys.courseProgressSummary('ppl'));
  });
});
