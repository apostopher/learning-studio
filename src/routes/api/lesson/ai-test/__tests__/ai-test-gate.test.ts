// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  evaluateLessonGate: vi.fn(),
  resolveDebriefSource: vi.fn(),
  generateTest: vi.fn(),
  evaluateFreeText: vi.fn(),
  evaluateMCQ: vi.fn(),
  saveTestResult: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/lesson-gating.server', () => ({
  evaluateLessonGate: m.evaluateLessonGate,
}));
vi.mock('#/lib/lesson-debrief-source.server', () => ({
  resolveDebriefSource: m.resolveDebriefSource,
}));
vi.mock('#/ai/generate-test', () => ({ generateTest: m.generateTest }));
vi.mock('#/db/lesson-test', () => ({ saveTestResult: m.saveTestResult }));
vi.mock('#/ai/evaluate-answer', () => ({
  evaluateFreeText: m.evaluateFreeText,
  evaluateMCQ: m.evaluateMCQ,
}));

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
  subscribed: true,
  level: 'basic',
  outOfTier: null,
  lessonLock: { kind: 'open' },
  materialLock: { kind: 'open' },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.evaluateLessonGate.mockResolvedValue(openGate);
  m.resolveDebriefSource.mockResolvedValue({ keyPoints: ['k'], text: 'body' });
  m.generateTest.mockResolvedValue({ lessonSlug: 'l1', questions: [] });
  m.evaluateFreeText.mockResolvedValue({ score: 80 });
  m.saveTestResult.mockResolvedValue({ id: 1 });
});

/**
 * Both debrief endpoints produce NEW assessment work, so an out-of-tier lesson
 * is refused in both cases — read-only included. A read-only archive view must
 * not let a pilot start or submit fresh work scored against a tier they have
 * moved past.
 *
 * Every case asserts the model was not called, not merely that the status was
 * 403: a refusal that still ran the generator costs real tokens and would have
 * written a result had the call succeeded.
 */
describe('debrief endpoints refuse out-of-tier lessons', () => {
  it('403s generate for a never-completed out-of-tier lesson, before the model', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: false },
    });
    const res = await generateTestHandler(
      post('/api/lesson/ai-test/generate', { lessonSlug: 'l1' }),
    );
    expect(res.status).toBe(403);
    expect(m.generateTest).not.toHaveBeenCalled();
    expect(m.resolveDebriefSource).not.toHaveBeenCalled();
  });

  it('403s generate for a COMPLETED out-of-tier lesson too', async () => {
    // Read-only means "you may read what you already did", never "you may
    // start something new against it".
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: true },
    });
    const res = await generateTestHandler(
      post('/api/lesson/ai-test/generate', { lessonSlug: 'l1' }),
    );
    expect(res.status).toBe(403);
    expect(m.generateTest).not.toHaveBeenCalled();
  });

  it('403s evaluate for a never-completed out-of-tier lesson, before the grader', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: false },
    });
    const res = await evaluateAnswerHandler(
      post('/api/lesson/ai-test/evaluate', {
        lessonSlug: 'l1',
        question: freeTextQuestion,
        userAnswer: 'an answer',
      }),
    );
    expect(res.status).toBe(403);
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
    expect(m.resolveDebriefSource).not.toHaveBeenCalled();
  });

  it('403s evaluate for a COMPLETED out-of-tier lesson too', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: true },
    });
    const res = await evaluateAnswerHandler(
      post('/api/lesson/ai-test/evaluate', {
        lessonSlug: 'l1',
        question: freeTextQuestion,
        userAnswer: 'an answer',
      }),
    );
    expect(res.status).toBe(403);
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
  });

  it('still grades an in-tier lesson', async () => {
    // The refusals above are only meaningful if the ordinary path still runs.
    const res = await evaluateAnswerHandler(
      post('/api/lesson/ai-test/evaluate', {
        lessonSlug: 'l1',
        question: freeTextQuestion,
        userAnswer: 'an answer',
      }),
    );
    expect(res.status).toBe(200);
    expect(m.evaluateFreeText).toHaveBeenCalledOnce();
  });
});

/**
 * Saving a completed debrief is the third write that feeds `lessonPercent`
 * (via `debriefAnswered`), so it is refused for an out-of-tier lesson in both
 * read-only states — an archive view may show a pilot the debrief they already
 * did, never record a new one.
 *
 * Each case asserts `saveTestResult` was not called: a 403 that had already
 * written the row would have handed over the escalation it exists to stop.
 */
describe('save-results refuses out-of-tier lessons', () => {
  const savePayload = {
    lessonSlug: 'l1',
    test: { lessonSlug: 'l1', questions: [] },
    evaluations: [],
    totalScore: 80,
  };

  it('403s a never-completed out-of-tier lesson without writing', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: false },
    });
    const res = await saveTestResultsHandler(
      post('/api/lesson/ai-test/save-results', savePayload),
    );
    expect(res.status).toBe(403);
    expect(m.saveTestResult).not.toHaveBeenCalled();
  });

  it('403s a COMPLETED out-of-tier lesson without writing', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: true },
    });
    const res = await saveTestResultsHandler(
      post('/api/lesson/ai-test/save-results', savePayload),
    );
    expect(res.status).toBe(403);
    expect(m.saveTestResult).not.toHaveBeenCalled();
  });

  it('still saves an in-tier result, locks and all', async () => {
    // Deliberately narrow, matching the other two write routes: the locks are
    // not honoured here, and widening that is a separate decision.
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      lessonLock: { kind: 'lesson-locked', lessonSlug: 'a', moduleSlug: 'm' },
    });
    const res = await saveTestResultsHandler(
      post('/api/lesson/ai-test/save-results', savePayload),
    );
    expect(res.status).toBe(200);
    expect(m.saveTestResult).toHaveBeenCalledOnce();
  });
});
