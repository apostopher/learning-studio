// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  evaluateLessonGate: vi.fn(),
  getDebriefAccess: vi.fn(),
  resolveDebriefSource: vi.fn(),
  generateTest: vi.fn(),
  evaluateFreeText: vi.fn(),
  evaluateMCQ: vi.fn(),
  saveTestResult: vi.fn(),
  getDebriefFacts: vi.fn(),
  settleProgress: vi.fn(),
  takePreparedDebrief: vi.fn(),
  prepareDebrief: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
// `evaluate` still reads the raw gate; `generate` and `save-results` ask the
// debrief access authority, which owns the gate, level and schedule checks
// (and has its own tests in `src/lib/__tests__/debrief-access.test.ts`).
vi.mock('#/lib/lesson-gating.server', () => ({
  evaluateLessonGate: m.evaluateLessonGate,
}));
vi.mock('#/lib/debrief-access.server', () => ({
  getDebriefAccess: m.getDebriefAccess,
}));
vi.mock('#/lib/lesson-debrief-source.server', () => ({
  resolveDebriefSource: m.resolveDebriefSource,
}));
vi.mock('#/ai/generate-test', () => ({ generateTest: m.generateTest }));
vi.mock('#/lib/prepared-debrief.server', () => ({
  takePreparedDebrief: m.takePreparedDebrief,
  prepareDebrief: m.prepareDebrief,
  // A recognisable stand-in, so a test can tell which text was fingerprinted.
  sourceFingerprint: (text: string) => `fp(${text})`,
}));
vi.mock('#/db/lesson-test', () => ({
  saveTestResult: m.saveTestResult,
  getDebriefFacts: m.getDebriefFacts,
}));
vi.mock('#/ai/evaluate-answer', () => ({
  evaluateFreeText: m.evaluateFreeText,
  evaluateMCQ: m.evaluateMCQ,
}));
// save-results calls settleProgress (never throws) after a successful write — stubbed so this
// file never reaches the real db/email modules it pulls in transitively.
vi.mock('#/lib/settle-progress.server', () => ({
  settleProgress: m.settleProgress,
}));
vi.mock('@vercel/functions', () => ({ waitUntil: m.waitUntil }));

// `#/ai/schemas` is deliberately NOT mocked: the real AITestQuestionSchema has
// to run, or a malformed question in these fixtures would 400 before ever
// reaching the gate and the test would pass for the wrong reason.

import { evaluateAnswerHandler } from '../evaluate';
import { generateTestHandler } from '../generate';
import { saveTestResultsHandler } from '../save-results';

const post = (url: string, body: unknown) =>
  new Request(`http://t${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const freeTextQuestion = {
  id: 'q1',
  type: 'free-text',
  question: 'Why?',
  expectedAnswer: 'Because.',
  keyPointIndex: 0,
};

const openGate = {
  courseSlug: 'c1',
  courseId: 7,
  subscribed: true,
  level: 'basic',
  outOfTier: null,
  lessonLock: { kind: 'open' },
  materialLock: { kind: 'open' },
};

const accessIn = (state: unknown) => ({
  ok: true,
  courseId: 7,
  lessonId: 41,
  state,
});
const OPEN = { kind: 'open', retake: false };
const AVAILABLE_AT = '2026-10-28T09:30:00.000Z';

/** Every state in which neither route may serve or record a debrief. */
const closedStates = [
  ['not-done', { kind: 'not-done' }, undefined],
  ['waiting', { kind: 'waiting', availableAt: AVAILABLE_AT }, AVAILABLE_AT],
  [
    'retake-waiting',
    { kind: 'retake-waiting', availableAt: AVAILABLE_AT },
    AVAILABLE_AT,
  ],
  ['passed', { kind: 'passed' }, undefined],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.evaluateLessonGate.mockResolvedValue(openGate);
  m.getDebriefAccess.mockResolvedValue(accessIn(OPEN));
  m.resolveDebriefSource.mockResolvedValue({ keyPoints: ['k'], text: 'body' });
  m.generateTest.mockResolvedValue({ lessonSlug: 'l1', questions: [] });
  m.evaluateFreeText.mockResolvedValue({ score: 80 });
  m.saveTestResult.mockResolvedValue({
    id: 1,
    completedAt: new Date('2026-10-27T09:30:00.000Z'),
  });
  m.getDebriefFacts.mockResolvedValue({
    doneAt: '2026-10-25T00:00:00.000Z',
    passed: true,
    lastFailedAt: null,
  });
  m.settleProgress.mockResolvedValue(null);
  m.takePreparedDebrief.mockResolvedValue(null);
  m.prepareDebrief.mockResolvedValue('prepared');
});

afterEach(() => {
  vi.useRealTimers();
});

const generate = () =>
  generateTestHandler(
    post('/api/lesson/ai-test/generate', {
      lessonSlug: 'l1',
      courseSlug: 'c1',
    }),
  );

/**
 * Evaluating an answer produces NEW assessment work, so an out-of-tier lesson
 * is refused in both cases — read-only included.
 *
 * Every case asserts the model was not called, not merely that the status was
 * 403: a refusal that still ran the grader costs real tokens.
 */
describe('evaluate refuses out-of-tier lessons', () => {
  it('403s a never-completed out-of-tier lesson, before the grader', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: false },
    });
    const res = await evaluateAnswerHandler(
      post('/api/lesson/ai-test/evaluate', {
        lessonSlug: 'l1',
        courseSlug: 'c1',
        question: freeTextQuestion,
        userAnswer: 'an answer',
      }),
    );
    expect(res.status).toBe(403);
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
    expect(m.resolveDebriefSource).not.toHaveBeenCalled();
  });

  it('403s a COMPLETED out-of-tier lesson too', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: true },
    });
    const res = await evaluateAnswerHandler(
      post('/api/lesson/ai-test/evaluate', {
        lessonSlug: 'l1',
        courseSlug: 'c1',
        question: freeTextQuestion,
        userAnswer: 'an answer',
      }),
    );
    expect(res.status).toBe(403);
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
  });

  it('still grades an in-tier lesson', async () => {
    const res = await evaluateAnswerHandler(
      post('/api/lesson/ai-test/evaluate', {
        lessonSlug: 'l1',
        courseSlug: 'c1',
        question: freeTextQuestion,
        userAnswer: 'an answer',
      }),
    );
    expect(res.status).toBe(200);
    expect(m.evaluateFreeText).toHaveBeenCalledOnce();
  });
});

describe('generate asks the debrief access authority first', () => {
  it('passes the session user, both slugs and a clock', async () => {
    await generate();
    expect(m.getDebriefAccess).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      courseSlug: 'c1',
      now: expect.any(Date),
    });
  });

  it.each([
    403, 404,
  ])('forwards a %s refusal without touching the source or the model', async (status) => {
    m.getDebriefAccess.mockResolvedValue({ ok: false, status });
    const res = await generate();
    expect(res.status).toBe(status);
    expect(m.resolveDebriefSource).not.toHaveBeenCalled();
    expect(m.takePreparedDebrief).not.toHaveBeenCalled();
    expect(m.generateTest).not.toHaveBeenCalled();
  });

  it.each(
    closedStates,
  )('409s while the debrief is %s, before any questions exist', async (_kind, state, availableAt) => {
    m.getDebriefAccess.mockResolvedValue(accessIn(state));
    const res = await generate();
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json).toEqual(
      availableAt ? { error: 'not-open', availableAt } : { error: 'not-open' },
    );
    expect(Object.hasOwn(json, 'availableAt')).toBe(availableAt !== undefined);
    expect(m.resolveDebriefSource).not.toHaveBeenCalled();
    expect(m.takePreparedDebrief).not.toHaveBeenCalled();
    expect(m.generateTest).not.toHaveBeenCalled();
  });
});

describe('generate, once the debrief is open', () => {
  const prepared = { lessonSlug: 'l1', questions: [freeTextQuestion] };

  it('serves the prepared test when its fingerprint matches the CURRENT source', async () => {
    m.takePreparedDebrief.mockResolvedValue(prepared);
    const res = await generate();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(prepared);
    expect(m.resolveDebriefSource).toHaveBeenCalledWith('l1', 7);
    expect(m.takePreparedDebrief).toHaveBeenCalledWith(
      { userId: 'u1', courseId: 7, lessonSlug: 'l1' },
      'fp(body)',
    );
    expect(m.generateTest).not.toHaveBeenCalled();
  });

  it('generates on demand when nothing matching was prepared', async () => {
    const res = await generate();
    expect(res.status).toBe(200);
    expect(m.takePreparedDebrief).toHaveBeenCalledOnce();
    expect(m.generateTest).toHaveBeenCalledWith('l1', ['k'], 'body');
  });

  it('422s a lesson with no debrief source, as before', async () => {
    m.resolveDebriefSource.mockResolvedValue(null);
    const res = await generate();
    expect(res.status).toBe(422);
    expect(m.generateTest).not.toHaveBeenCalled();
  });

  it('serves a retake the same way', async () => {
    m.getDebriefAccess.mockResolvedValue(
      accessIn({ kind: 'open', retake: true }),
    );
    const res = await generate();
    expect(res.status).toBe(200);
    expect(m.generateTest).toHaveBeenCalledOnce();
  });
});

describe('generate request shape', () => {
  it('400s without a courseSlug, before the access check', async () => {
    const res = await generateTestHandler(
      post('/api/lesson/ai-test/generate', { lessonSlug: 'l1' }),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/courseSlug/);
    expect(m.getDebriefAccess).not.toHaveBeenCalled();
    expect(m.generateTest).not.toHaveBeenCalled();
  });
});

describe('evaluate request shape', () => {
  it('400s without a courseSlug, even for an MCQ', async () => {
    // MCQ grading needs no lesson content, but the request shape is one
    // contract: a malformed body is refused before the type is looked at.
    const res = await evaluateAnswerHandler(
      post('/api/lesson/ai-test/evaluate', {
        lessonSlug: 'l1',
        question: {
          id: 'q1',
          type: 'mcq',
          question: 'Which?',
          options: [
            { id: 'a', value: 'A' },
            { id: 'b', value: 'B' },
            { id: 'c', value: 'C' },
            { id: 'd', value: 'D' },
          ],
          correctOptionId: 'a',
          keyPointIndex: 0,
        },
        userAnswer: 'a',
      }),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/courseSlug/);
    expect(m.evaluateLessonGate).not.toHaveBeenCalled();
    expect(m.evaluateMCQ).not.toHaveBeenCalled();
  });

  it("passes both slugs to the gate and the gate's course to the source", async () => {
    m.evaluateLessonGate.mockResolvedValue({ ...openGate, courseId: 42 });
    await evaluateAnswerHandler(
      post('/api/lesson/ai-test/evaluate', {
        lessonSlug: 'l1',
        courseSlug: 'c-real',
        question: freeTextQuestion,
        userAnswer: 'an answer',
      }),
    );
    expect(m.evaluateLessonGate).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      courseSlug: 'c-real',
    });
    expect(m.resolveDebriefSource).toHaveBeenCalledWith('l1', 42);
  });
});

describe('save-results', () => {
  const payload = (totalScore = 80) => ({
    lessonSlug: 'l1',
    courseSlug: 'c1',
    test: { lessonSlug: 'l1', questions: [] },
    evaluations: [],
    totalScore,
  });
  const save = (totalScore?: number) =>
    saveTestResultsHandler(
      post('/api/lesson/ai-test/save-results', payload(totalScore)),
    );

  it("records the attempt against the SESSION user, not 'dev-user'", async () => {
    await save();
    expect(m.saveTestResult).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      questions: { lessonSlug: 'l1', questions: [] },
      answers: [],
      totalScore: 80,
    });
  });

  it('asks the access authority with the session user, both slugs and a clock', async () => {
    await save();
    expect(m.getDebriefAccess).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      courseSlug: 'c1',
      now: expect.any(Date),
    });
  });

  it('400s without a courseSlug, before the access check', async () => {
    const { courseSlug: _omitted, ...withoutCourse } = payload();
    const res = await saveTestResultsHandler(
      post('/api/lesson/ai-test/save-results', withoutCourse),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/courseSlug/);
    expect(m.getDebriefAccess).not.toHaveBeenCalled();
    expect(m.saveTestResult).not.toHaveBeenCalled();
  });

  it.each([
    403, 404,
  ])('forwards a %s refusal without writing or settling', async (status) => {
    m.getDebriefAccess.mockResolvedValue({ ok: false, status });
    const res = await save();
    expect(res.status).toBe(status);
    expect(m.saveTestResult).not.toHaveBeenCalled();
    expect(m.settleProgress).not.toHaveBeenCalled();
  });

  // Review Focus 3: a stale second tab submitting after the debrief relocked.
  it.each(
    closedStates,
  )('409s while the debrief is %s, with no attempt row written', async (_kind, state, availableAt) => {
    m.getDebriefAccess.mockResolvedValue(accessIn(state));
    const res = await save();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(
      availableAt ? { error: 'not-open', availableAt } : { error: 'not-open' },
    );
    expect(m.saveTestResult).not.toHaveBeenCalled();
    expect(m.settleProgress).not.toHaveBeenCalled();
    expect(m.prepareDebrief).not.toHaveBeenCalled();
  });

  it('settles for the session user and returns its promotion', async () => {
    const promotion = { id: 5, from: 'basic', to: 'intermediate' };
    m.settleProgress.mockResolvedValue(promotion);
    const res = await save();
    expect(m.settleProgress).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'c1',
    });
    expect((await res.json()).promotion).toEqual(promotion);
  });

  it('pre-generates the retake after a below-par save, in the background', async () => {
    await save(69);
    expect(m.prepareDebrief).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      lessonSlug: 'l1',
    });
    // After the attempt is recorded, never before it.
    expect(m.prepareDebrief.mock.invocationCallOrder[0]).toBeGreaterThan(
      m.saveTestResult.mock.invocationCallOrder[0],
    );
    // Handed to the platform to finish after the response is sent.
    expect(m.waitUntil).toHaveBeenCalledOnce();
    expect(m.waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it('does not hold the response for the retake preparation', async () => {
    m.prepareDebrief.mockReturnValue(new Promise(() => {}));
    const res = await save(69);
    expect(res.status).toBe(200);
  });

  it('does not prepare anything after a pass (70 is par)', async () => {
    await save(70);
    expect(m.prepareDebrief).not.toHaveBeenCalled();
    expect(m.waitUntil).not.toHaveBeenCalled();
  });

  it('returns the state recomputed AFTER the save — retake-waiting 24h from the attempt', async () => {
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-10-27T09:30:00.000Z'),
    });
    m.getDebriefFacts.mockResolvedValue({
      doneAt: '2026-10-25T00:00:00.000Z',
      passed: false,
      lastFailedAt: '2026-10-27T09:30:00.000Z',
    });
    const res = await save(69);
    expect(m.getDebriefFacts).toHaveBeenCalledWith('u1', 'l1', 41);
    expect(m.getDebriefFacts.mock.invocationCallOrder[0]).toBeGreaterThan(
      m.saveTestResult.mock.invocationCallOrder[0],
    );
    expect((await res.json()).state).toEqual({
      kind: 'retake-waiting',
      availableAt: '2026-10-28T09:30:00.000Z',
    });
  });

  it('returns passed after a pass', async () => {
    const res = await save(70);
    expect((await res.json()).state).toEqual({ kind: 'passed' });
  });

  it('still answers with the state when re-reading the facts fails — the attempt is saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    m.getDebriefFacts.mockRejectedValue(new Error('db blip'));
    const res = await save(69);
    expect(res.status).toBe(200);
    expect((await res.json()).state).toEqual({
      kind: 'retake-waiting',
      availableAt: '2026-10-28T09:30:00.000Z',
    });
  });
});
