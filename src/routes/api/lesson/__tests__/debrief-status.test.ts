// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDebriefAccess: vi.fn(),
  getDebriefAttemptReports: vi.fn(),
  selectLatestFinishedChunkAttempt: vi.fn(),
  getCourseProgress: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/debrief-access.server', () => ({
  getDebriefAccess: m.getDebriefAccess,
}));
vi.mock('#/db/lesson-test', () => ({
  getDebriefAttemptReports: m.getDebriefAttemptReports,
  selectLatestFinishedChunkAttempt: m.selectLatestFinishedChunkAttempt,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: m.getCourseProgress,
}));

import { debriefStatusHandler } from '../debrief-status';

const get = (qs: string) =>
  new Request(`http://t/api/lesson/debrief-status${qs}`);
const QS = '?lessonSlug=l1&courseSlug=c1';

const access = (
  state: unknown,
  mastery: { cleared: number; total: number } | null = null,
) => ({
  ok: true,
  courseId: 7,
  lessonId: 41,
  state,
  mastery,
});

/**
 * A finished chunk attempt AS STORED: the snapshot carries the grading key
 * (expected answers, chunk tags, chunk summaries, context) and each answer
 * its chunk scores. None of it may reach the pilot.
 */
const storedChunkAttempt = {
  questions: {
    lessonSlug: 'l1',
    questions: [
      {
        id: 'q1',
        type: 'free-text',
        question: 'Why does lift fall when you slow down?',
        expectedAnswer: 'SECRET-EXPECTED-ANSWER-1',
        chunkIds: ['v1-c1'],
      },
      {
        id: 'q2',
        type: 'free-text',
        question: 'What sets the stall?',
        expectedAnswer: 'SECRET-EXPECTED-ANSWER-2',
        chunkIds: ['v1-c2'],
      },
    ],
    chunks: [
      { id: 'v1-c1', title: 'Lift', summary: 'SECRET-CHUNK-SUMMARY' },
      { id: 'v1-c2', title: 'Stall', summary: 'SECRET-CHUNK-SUMMARY-2' },
    ],
    context: 'SECRET-LESSON-CONTEXT',
  },
  answers: [
    {
      questionId: 'q2',
      type: 'free-text',
      score: 40,
      userAnswer: 'speed',
      explanation: '',
      revisitNote: 'A stall is about angle of attack, not speed.',
      chunkScores: { 'v1-c2': 40 },
    },
    {
      questionId: 'q1',
      type: 'free-text',
      score: 90,
      userAnswer: 'lift goes with speed squared',
      explanation: '',
      revisitNote: '',
      chunkScores: { 'v1-c1': 90 },
    },
  ],
};

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
  m.selectLatestFinishedChunkAttempt.mockResolvedValue(null);
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
    ['open (first attempt)', { kind: 'open', retake: false }],
    ['waiting', { kind: 'waiting', availableAt: '2026-10-28T00:00:00.000Z' }],
  ])('hides the attempt history and the report while %s', async (_n, state) => {
    m.getDebriefAccess.mockResolvedValue(
      access(state, { cleared: 0, total: 4 }),
    );
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(body).toEqual({ state, lessonOutstanding: [] });
    expect(m.getDebriefAttemptReports).not.toHaveBeenCalled();
    expect(m.selectLatestFinishedChunkAttempt).not.toHaveBeenCalled();
  });

  it.each([
    [
      'retake-waiting',
      { kind: 'retake-waiting', availableAt: '2026-10-28T00:00:00.000Z' },
    ],
    ['open for a retake', { kind: 'open', retake: true, resume: false }],
  ])("while %s, carries mastery and the last attempt's revisit notes — never its grading key", async (_n, state) => {
    m.getDebriefAccess.mockResolvedValue(
      access(state, { cleared: 5, total: 7 }),
    );
    m.selectLatestFinishedChunkAttempt.mockResolvedValue(storedChunkAttempt);
    const res = await debriefStatusHandler(get(QS));
    const text = await res.text();
    const body = JSON.parse(text);

    expect(m.selectLatestFinishedChunkAttempt).toHaveBeenCalledWith('u1', 'l1');
    expect(body.state).toEqual(state);
    expect(body.mastery).toEqual({ cleared: 5, total: 7, percent: 71 });
    // Question order, not answer order; the cleared answer's empty note dropped.
    expect(body.revisitNotes).toEqual([
      'A stall is about angle of attack, not speed.',
    ]);
    expect('attempts' in body).toBe(false);
    for (const secret of [
      'SECRET',
      'expectedAnswer',
      'chunkIds',
      'chunkScores',
      'v1-c1',
      'context',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('with no chunks stored and no chunk attempt (legacy only), mastery is null and there are no notes', async () => {
    m.getDebriefAccess.mockResolvedValue(
      access(
        { kind: 'retake-waiting', availableAt: '2026-10-28T00:00:00.000Z' },
        null,
      ),
    );
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(body.mastery).toBeNull();
    expect(body.revisitNotes).toEqual([]);
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

  it('returns only the video when not done and the video is outstanding — watching it starts the clock', async () => {
    m.getDebriefAccess.mockResolvedValue(access({ kind: 'not-done' }));
    m.getCourseProgress.mockResolvedValue({
      lessons: [
        { lessonId: 40, outstanding: [{ kind: 'quiz' }] },
        {
          lessonId: 41,
          outstanding: [
            { kind: 'video' },
            { kind: 'quiz' },
            { kind: 'section', section: 'links' },
          ],
        },
      ],
    });
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(m.getCourseProgress).toHaveBeenCalledWith({
      userId: 'u1',
      slug: 'c1',
    });
    expect(body.lessonOutstanding).toEqual([{ kind: 'video' }]);
    expect('attempts' in body).toBe(false);
  });

  it('returns the video on a lesson done without its optional video — only the full watch starts the clock', async () => {
    m.getDebriefAccess.mockResolvedValue(access({ kind: 'not-done' }));
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 41, outstanding: [], debrief: { hasVideo: true } }],
    });
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(body.lessonOutstanding).toEqual([{ kind: 'video' }]);
  });

  it('returns everything left to finish the lesson when there is no video to watch', async () => {
    m.getDebriefAccess.mockResolvedValue(access({ kind: 'not-done' }));
    m.getCourseProgress.mockResolvedValue({
      lessons: [
        {
          lessonId: 41,
          outstanding: [
            { kind: 'quiz' },
            { kind: 'section', section: 'links' },
          ],
        },
      ],
    });
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(body.lessonOutstanding).toEqual([
      { kind: 'quiz' },
      { kind: 'section', section: 'links' },
    ]);
  });

  it('returns no outstanding items when the lesson is absent from progress', async () => {
    m.getDebriefAccess.mockResolvedValue(access({ kind: 'not-done' }));
    const body = await (await debriefStatusHandler(get(QS))).json();
    expect(body.lessonOutstanding).toEqual([]);
  });

  it('once passed, lists attempts passing first then newest first, with their score-report data', async () => {
    m.getDebriefAccess.mockResolvedValue(access({ kind: 'passed' }));
    m.getDebriefAttemptReports.mockResolvedValue([
      { ...report(4, 40, '2026-10-27T10:00:00.000Z'), passed: false },
      { ...report(3, 85, '2026-10-26T10:00:00.000Z'), passed: true },
      { ...report(2, 30, '2026-10-25T10:00:00.000Z'), passed: false },
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
