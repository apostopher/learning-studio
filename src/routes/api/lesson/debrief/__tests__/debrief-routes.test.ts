// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDebriefAccess: vi.fn(),
  startOrResumeAttempt: vi.fn(),
  answerQuestion: vi.fn(),
  saveDraft: vi.fn(),
  getAttemptOwner: vi.fn(),
  settleProgress: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/debrief-access.server', () => ({
  getDebriefAccess: m.getDebriefAccess,
}));
vi.mock('#/lib/debrief-attempt.server', () => ({
  startOrResumeAttempt: m.startOrResumeAttempt,
  answerQuestion: m.answerQuestion,
  saveDraft: m.saveDraft,
  getAttemptOwner: m.getAttemptOwner,
}));
vi.mock('#/lib/settle-progress.server', () => ({
  settleProgress: m.settleProgress,
}));

import { answerDebriefHandler } from '../answer';
import { saveDraftHandler } from '../draft';
import { startDebriefHandler } from '../start';

const post = (path: string, body: unknown) =>
  new Request(`http://t/api/lesson/debrief/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const access = (state: unknown) => ({
  ok: true,
  courseId: 7,
  lessonId: 41,
  state,
});
const open = { kind: 'open', retake: false, resume: false };
const metrics = {
  msOnQuestion: 60_000,
  msToFirstKey: 3_000,
  deletions: 2,
  charsDeleted: 10,
  rewrites: 0,
  pasteBlocked: 1,
  msHidden: 0,
  finalLength: 120,
};
const view = {
  attemptId: 5,
  questions: [{ id: 'q1', question: 'Why?' }],
  answered: [],
  draft: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getDebriefAccess.mockResolvedValue(access(open));
  m.startOrResumeAttempt.mockResolvedValue({ ok: true, attempt: view });
  m.getAttemptOwner.mockResolvedValue({ userId: 'u1', lessonSlug: 'l1' });
  m.answerQuestion.mockResolvedValue({
    ok: true,
    evaluation: { score: 40, revisitNote: 'note' },
    mastery: { cleared: 1, total: 2, percent: 50 },
    finished: null,
  });
  m.saveDraft.mockResolvedValue('saved');
  m.settleProgress.mockResolvedValue({ level: 'advanced' });
});

describe('start', () => {
  const body = { courseSlug: 'c1', lessonSlug: 'l1' };
  const start = (b: unknown = body) => startDebriefHandler(post('start', b));

  it('asks the access authority, then starts for the session pilot in the resolved course', async () => {
    const res = await start();
    expect(m.getDebriefAccess).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      courseSlug: 'c1',
      now: expect.any(Date),
    });
    expect(m.startOrResumeAttempt).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      lessonId: 41,
      lessonSlug: 'l1',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(view);
  });

  it.each([
    [
      'retake-waiting',
      { kind: 'retake-waiting', availableAt: '2026-11-12T18:00:00.000Z' },
      { error: 'not-open', availableAt: '2026-11-12T18:00:00.000Z' },
    ],
    [
      'waiting',
      { kind: 'waiting', availableAt: '2026-11-12T12:00:00.000Z' },
      { error: 'not-open', availableAt: '2026-11-12T12:00:00.000Z' },
    ],
    ['not-done', { kind: 'not-done' }, { error: 'not-open' }],
    ['passed', { kind: 'passed' }, { error: 'not-open' }],
  ])('409s with the not-open body when %s, before any generation', async (_k, state, expected) => {
    m.getDebriefAccess.mockResolvedValue(access(state));
    const res = await start();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(expected);
    expect(m.startOrResumeAttempt).not.toHaveBeenCalled();
  });

  it('resumes when the state says an attempt is open', async () => {
    m.getDebriefAccess.mockResolvedValue(
      access({ kind: 'open', retake: true, resume: true }),
    );
    expect((await start()).status).toBe(200);
    expect(m.startOrResumeAttempt).toHaveBeenCalledOnce();
  });

  it.each([
    403, 404,
  ])('passes an access refusal (%s) through', async (status) => {
    m.getDebriefAccess.mockResolvedValue({ ok: false, status });
    expect((await start()).status).toBe(status);
    expect(m.startOrResumeAttempt).not.toHaveBeenCalled();
  });

  it('422s a lesson with nothing to build a debrief from', async () => {
    m.startOrResumeAttempt.mockResolvedValue({
      ok: false,
      reason: 'no-source',
    });
    expect((await start()).status).toBe(422);
  });

  it('a pass recorded at start (every chunk already cleared) settles progress and returns the promotion', async () => {
    m.startOrResumeAttempt.mockResolvedValue({ ok: false, reason: 'passed' });
    const res = await start();
    expect(m.settleProgress).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'c1',
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'not-open',
      promotion: { level: 'advanced' },
    });
  });

  it('does not settle on an ordinary start', async () => {
    await start();
    expect(m.settleProgress).not.toHaveBeenCalled();
  });

  it('401s without a session, 400s without a courseSlug, 500s on a failure', async () => {
    m.getSession.mockResolvedValueOnce(null);
    expect((await start()).status).toBe(401);
    expect((await start({ lessonSlug: 'l1' })).status).toBe(400);
    m.startOrResumeAttempt.mockRejectedValue(new Error('model down'));
    expect((await start()).status).toBe(500);
  });
});

describe('answer', () => {
  const body = {
    courseSlug: 'c1',
    attemptId: 5,
    questionId: 'q1',
    answer: 'Because the wing stalls.',
    metrics,
  };
  const send = (b: unknown = body) => answerDebriefHandler(post('answer', b));

  it('gates on the attempt’s lesson in the named course, then answers for the session pilot', async () => {
    const res = await send();
    expect(m.getAttemptOwner).toHaveBeenCalledWith(5);
    expect(m.getDebriefAccess).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      courseSlug: 'c1',
      now: expect.any(Date),
    });
    expect(m.answerQuestion).toHaveBeenCalledWith({
      userId: 'u1',
      attemptId: 5,
      questionId: 'q1',
      answer: 'Because the wing stalls.',
      metrics,
      lessonId: 41,
      courseId: 7,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      evaluation: { score: 40, revisitNote: 'note' },
      mastery: { cleared: 1, total: 2, percent: 50 },
      finished: null,
      promotion: null,
    });
    expect(m.settleProgress).not.toHaveBeenCalled();
  });

  it.each([
    'all-answered',
    'all-cleared',
  ])('settles progress on finish (%s) and returns the promotion', async (finished) => {
    m.answerQuestion.mockResolvedValue({
      ok: true,
      evaluation: { score: 80, revisitNote: '' },
      mastery: { cleared: 2, total: 2, percent: 100 },
      finished,
    });
    const res = await send();
    expect(m.settleProgress).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'c1',
    });
    expect((await res.json()).promotion).toEqual({ level: 'advanced' });
  });

  it('403s another pilot’s attempt without gating or grading', async () => {
    m.getAttemptOwner.mockResolvedValue({ userId: 'u2', lessonSlug: 'l1' });
    expect((await send()).status).toBe(403);
    expect(m.answerQuestion).not.toHaveBeenCalled();
  });

  it('403s an unknown attempt', async () => {
    m.getAttemptOwner.mockResolvedValue(null);
    expect((await send()).status).toBe(403);
  });

  it('403s a finished attempt (the service refuses it)', async () => {
    m.answerQuestion.mockResolvedValue({ ok: false, reason: 'forbidden' });
    expect((await send()).status).toBe(403);
  });

  it('400s an answer out of order', async () => {
    m.answerQuestion.mockResolvedValue({ ok: false, reason: 'out-of-order' });
    expect((await send()).status).toBe(400);
  });

  it.each([
    403, 404,
  ])('passes an access refusal (%s) through without grading', async (status) => {
    m.getDebriefAccess.mockResolvedValue({ ok: false, status });
    expect((await send()).status).toBe(status);
    expect(m.answerQuestion).not.toHaveBeenCalled();
  });

  it.each([
    ['no metrics', { ...body, metrics: undefined }],
    ['a negative metric', { ...body, metrics: { ...metrics, msHidden: -1 } }],
    ['a blank answer', { ...body, answer: '   ' }],
    ['an over-long answer', { ...body, answer: 'x'.repeat(10_001) }],
    ['no courseSlug', { ...body, courseSlug: undefined }],
  ])('400s %s', async (_why, b) => {
    expect((await send(b)).status).toBe(400);
    expect(m.answerQuestion).not.toHaveBeenCalled();
  });

  it('401s without a session', async () => {
    m.getSession.mockResolvedValue(null);
    expect((await send()).status).toBe(401);
  });
});

describe('draft', () => {
  const body = { attemptId: 5, questionId: 'q1', text: 'half an answer' };
  const save = (b: unknown = body) => saveDraftHandler(post('draft', b));

  it('saves for the session pilot, with no body', async () => {
    const res = await save();
    expect(m.saveDraft).toHaveBeenCalledWith({
      userId: 'u1',
      attemptId: 5,
      questionId: 'q1',
      text: 'half an answer',
    });
    expect(res.status).toBe(204);
  });

  it('403s a finished or someone else’s attempt', async () => {
    m.saveDraft.mockResolvedValue('forbidden');
    expect((await save()).status).toBe(403);
  });

  it('400s a draft for a question that is not the current one', async () => {
    m.saveDraft.mockResolvedValue('wrong-question');
    expect((await save()).status).toBe(400);
  });

  it('accepts an empty draft (the pilot cleared the box)', async () => {
    expect((await save({ ...body, text: '' })).status).toBe(204);
  });

  it('400s an over-long draft, 401s without a session', async () => {
    expect((await save({ ...body, text: 'x'.repeat(10_001) })).status).toBe(
      400,
    );
    m.getSession.mockResolvedValue(null);
    expect((await save()).status).toBe(401);
  });
});
