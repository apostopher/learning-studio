// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDebriefAccess: vi.fn(),
  getDebriefAttemptReports: vi.fn(),
  getCourseProgress: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/debrief-access.server', () => ({
  getDebriefAccess: m.getDebriefAccess,
}));
vi.mock('#/db/lesson-test', () => ({
  getDebriefAttemptReports: m.getDebriefAttemptReports,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: m.getCourseProgress,
}));

import { debriefStatusHandler } from '../debrief-status';

const get = (qs: string) =>
  new Request(`http://t/api/lesson/debrief-status${qs}`);
const QS = '?lessonSlug=l1&courseSlug=c1';

const access = (state: unknown) => ({
  ok: true,
  courseId: 7,
  lessonId: 41,
  state,
});

const report = (id: number, totalScore: number, completedAt: string) => ({
  id,
  totalScore,
  completedAt,
  questions: [{ id: `q${id}` }],
  evaluations: [{ questionId: `q${id}` }],
});

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getDebriefAccess.mockResolvedValue(access({ kind: 'open', retake: false }));
  m.getDebriefAttemptReports.mockResolvedValue([]);
  m.getCourseProgress.mockResolvedValue({ lessons: [] });
});

describe('debrief-status', () => {
  it('is 401 without a session', async () => {
    m.getSession.mockResolvedValue(null);
    expect((await debriefStatusHandler(get(QS))).status).toBe(401);
  });

  it.each([
    ['lessonSlug', '?courseSlug=c1'],
    ['courseSlug', '?lessonSlug=l1'],
  ])('is 400 when %s is missing', async (_n, qs) => {
    expect((await debriefStatusHandler(get(qs))).status).toBe(400);
    expect(m.getDebriefAccess).not.toHaveBeenCalled();
  });

  it('asks the access authority about this pilot in the named course', async () => {
    await debriefStatusHandler(get(QS));
    expect(m.getDebriefAccess).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      courseSlug: 'c1',
      now: expect.any(Date),
    });
  });

  it.each([403, 404])('passes a %s from access straight through', async (s) => {
    m.getDebriefAccess.mockResolvedValue({ ok: false, status: s });
    const res = await debriefStatusHandler(get(QS));
    expect(res.status).toBe(s);
    expect(m.getDebriefAttemptReports).not.toHaveBeenCalled();
    expect(m.getCourseProgress).not.toHaveBeenCalled();
  });

  it.each([
    ['open', { kind: 'open', retake: true }],
    ['waiting', { kind: 'waiting', availableAt: '2026-10-28T00:00:00.000Z' }],
    [
      'retake-waiting',
      { kind: 'retake-waiting', availableAt: '2026-10-28T00:00:00.000Z' },
    ],
  ])('hides the attempt history while %s', async (_n, state) => {
    m.getDebriefAccess.mockResolvedValue(access(state));
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(body).toEqual({ state, lessonOutstanding: [] });
    expect('attempts' in body).toBe(false);
    expect(m.getDebriefAttemptReports).not.toHaveBeenCalled();
  });

  it('reads course progress only for a lesson that is not done', async () => {
    for (const state of [
      { kind: 'open', retake: false },
      { kind: 'waiting', availableAt: '2026-10-28T00:00:00.000Z' },
      { kind: 'retake-waiting', availableAt: '2026-10-28T00:00:00.000Z' },
      { kind: 'passed' },
    ]) {
      m.getDebriefAccess.mockResolvedValue(access(state));
      await debriefStatusHandler(get(QS));
    }
    expect(m.getCourseProgress).not.toHaveBeenCalled();
  });

  it('returns the outstanding items of this lesson when not done', async () => {
    m.getDebriefAccess.mockResolvedValue(access({ kind: 'not-done' }));
    m.getCourseProgress.mockResolvedValue({
      lessons: [
        { lessonId: 40, outstanding: [{ kind: 'quiz' }] },
        { lessonId: 41, outstanding: [{ kind: 'video' }, { kind: 'visit' }] },
      ],
    });
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(m.getCourseProgress).toHaveBeenCalledWith({
      userId: 'u1',
      slug: 'c1',
    });
    expect(body.lessonOutstanding).toEqual([
      { kind: 'video' },
      { kind: 'visit' },
    ]);
    expect('attempts' in body).toBe(false);
  });

  it('returns no outstanding items when the lesson is absent from progress', async () => {
    m.getDebriefAccess.mockResolvedValue(access({ kind: 'not-done' }));
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(body.lessonOutstanding).toEqual([]);
  });

  it('once passed, lists attempts passing first then newest first, with their score-report data', async () => {
    m.getDebriefAccess.mockResolvedValue(access({ kind: 'passed' }));
    m.getDebriefAttemptReports.mockResolvedValue([
      report(4, 40, '2026-10-27T10:00:00.000Z'),
      report(3, 85, '2026-10-26T10:00:00.000Z'),
      report(2, 30, '2026-10-25T10:00:00.000Z'),
    ]);
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(m.getDebriefAttemptReports).toHaveBeenCalledWith('u1', 'l1');
    expect(body.state).toEqual({ kind: 'passed' });
    expect(body.lessonOutstanding).toEqual([]);
    expect(body.attempts).toEqual([
      { ...report(3, 85, '2026-10-26T10:00:00.000Z'), passed: true },
      { ...report(4, 40, '2026-10-27T10:00:00.000Z'), passed: false },
      { ...report(2, 30, '2026-10-25T10:00:00.000Z'), passed: false },
    ]);
  });

  it('is 500 when a read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    m.getDebriefAccess.mockRejectedValue(new Error('db'));
    expect((await debriefStatusHandler(get(QS))).status).toBe(500);
  });
});
