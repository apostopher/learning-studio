import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DebriefStatusError,
  fetchDebriefStatus,
} from '#/data-hooks/use-debrief-status';

afterEach(() => vi.unstubAllGlobals());

const lesson = { courseSlug: 'ppl', lessonSlug: 'l1' };
const respond = (status: number, body: unknown = {}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );

/**
 * The panel tells a refusal (403/404) apart from a failure by the status
 * code, so the error the query surfaces must carry it.
 */
describe('fetchDebriefStatus', () => {
  it.each([
    403, 404, 500,
  ])('rejects with the HTTP status (%i)', async (code) => {
    respond(code);
    const error = await fetchDebriefStatus(lesson).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DebriefStatusError);
    expect((error as DebriefStatusError).status).toBe(code);
  });

  it('still validates a 200 with zod', async () => {
    respond(200, { state: { kind: 'nonsense' }, lessonOutstanding: [] });
    await expect(fetchDebriefStatus(lesson)).rejects.toThrow();
  });
});

describe('fetchDebriefStatus — what the route sends now', () => {
  it('parses an open state that says whether it resumes', async () => {
    respond(200, {
      state: { kind: 'open', retake: true, resume: true },
      lessonOutstanding: [],
    });
    expect((await fetchDebriefStatus(lesson)).state).toEqual({
      kind: 'open',
      retake: true,
      resume: true,
    });
  });

  it('parses passed history as the route projects it, legacy MCQ attempts included', async () => {
    const attempts = [
      {
        id: 7,
        totalScore: 100,
        completedAt: '2026-11-10T10:00:00.000Z',
        passed: true,
        questions: [{ id: 'q1', question: 'Why brief first?' }],
        evaluations: [
          {
            questionId: 'q1',
            type: 'free-text',
            score: 80,
            userAnswer: 'Because',
            explanation: '',
            revisitNote: '',
          },
        ],
      },
      {
        // An old multiple-choice attempt: options are gone after projection.
        id: 3,
        totalScore: 60,
        completedAt: '2026-09-01T10:00:00.000Z',
        passed: false,
        questions: [{ id: 'm1', question: 'What is V1?' }],
        evaluations: [
          {
            questionId: 'm1',
            type: 'mcq',
            score: 0,
            userAnswer: 'b',
            explanation: 'Wrong option.',
          },
        ],
      },
    ];
    respond(200, {
      state: { kind: 'passed' },
      lessonOutstanding: [],
      attempts,
    });
    const status = await fetchDebriefStatus(lesson);
    expect(status.attempts?.map((a) => a.questions)).toEqual([
      [{ id: 'q1', question: 'Why brief first?' }],
      [{ id: 'm1', question: 'What is V1?' }],
    ]);
    expect(status.attempts?.[1]?.evaluations[0]?.score).toBe(0);
  });

  it('rejects the retired rewatch state', async () => {
    respond(200, {
      state: { kind: 'rewatch-required' },
      lessonOutstanding: [],
    });
    await expect(fetchDebriefStatus(lesson)).rejects.toThrow();
  });
});
