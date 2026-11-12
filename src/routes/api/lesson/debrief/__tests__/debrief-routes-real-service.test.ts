// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The routes over the REAL attempt service, with only the db layer, the AI
 * and the source resolver stubbed — so what is asserted is what an HTTP
 * client actually receives and what the grader actually got.
 */
const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDebriefAccess: vi.fn(),
  settleProgress: vi.fn(),
  selectOpenAttempt: vi.fn(),
  selectAttempt: vi.fn(),
  lockAttempt: vi.fn(),
  updateAttempt: vi.fn(),
  selectCurrentChunks: vi.fn(),
  selectMastery: vi.fn(),
  evaluateFreeText: vi.fn(),
  resolveDebriefSource: vi.fn(),
  ensureLessonChunks: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/debrief-access.server', () => ({
  getDebriefAccess: m.getDebriefAccess,
}));
vi.mock('#/lib/settle-progress.server', () => ({
  settleProgress: m.settleProgress,
}));
vi.mock('#/db', () => ({
  db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock('#/db/debrief-attempts', () => ({
  selectOpenAttempt: m.selectOpenAttempt,
  insertAttempt: vi.fn(),
  selectAttempt: m.selectAttempt,
  lockAttempt: m.lockAttempt,
  updateAttempt: m.updateAttempt,
  selectCurrentChunks: m.selectCurrentChunks,
  selectMastery: m.selectMastery,
  upsertMastery: vi.fn(),
  insertAnswerLog: vi.fn(),
  insertPass: vi.fn(),
  updateDraft: vi.fn(),
  selectAskedQuestions: vi.fn(),
}));
vi.mock('#/lib/knowledge-chunks.server', () => ({
  ensureLessonChunks: m.ensureLessonChunks,
  mapToCurrentChunkIds: (s: Record<string, number>) => s,
}));
vi.mock('#/lib/prepared-debrief.server', () => ({
  takePreparedDebrief: vi.fn(),
  prepareDebrief: vi.fn(async () => 'prepared'),
  preparedFingerprint: () => 'fp',
}));
vi.mock('#/ai/generate-test', () => ({ generateTest: vi.fn() }));
vi.mock('#/ai/evaluate-answer', () => ({
  evaluateFreeText: m.evaluateFreeText,
}));
vi.mock('#/lib/lesson-debrief-source.server', () => ({
  resolveDebriefSource: m.resolveDebriefSource,
}));
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));

import { answerDebriefHandler } from '../answer';
import { startDebriefHandler } from '../start';

const chunks = [
  { id: 'v1-c1', title: 'Stall AoA', summary: 'SECRET-SUMMARY-1' },
  { id: 'v1-c2', title: 'Load factor', summary: 'SECRET-SUMMARY-2' },
];
const question = {
  id: 'q1',
  type: 'free-text',
  question: 'Why does the wing stall?',
  expectedAnswer: 'SECRET-ANSWER',
  chunkIds: ['v1-c1'],
};
const row = {
  id: 5,
  userId: 'u1',
  lessonSlug: 'l1',
  questions: {
    lessonSlug: 'l1',
    questions: [question],
    chunks,
    context: 'SECRET-CONTEXT',
  },
  answers: [],
  totalScore: null,
  completedAt: null,
  createdAt: new Date(),
  format: 'knowledge-chunks-v1',
  chunkVersion: 1,
  draft: null,
  finishedReason: null,
};
const post = (path: string, body: unknown) =>
  new Request(`http://t/api/lesson/debrief/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getDebriefAccess.mockResolvedValue({
    ok: true,
    courseId: 7,
    lessonId: 41,
    state: { kind: 'open', retake: true, resume: true },
  });
  m.settleProgress.mockResolvedValue(null);
  m.selectOpenAttempt.mockResolvedValue(row);
  m.selectAttempt.mockResolvedValue(row);
  m.lockAttempt.mockResolvedValue(row);
  m.selectCurrentChunks.mockResolvedValue({
    version: 1,
    chunks,
    previousMapping: null,
  });
  m.selectMastery.mockResolvedValue([]);
  // The lesson's material and captions are gone.
  m.resolveDebriefSource.mockResolvedValue(null);
  m.ensureLessonChunks.mockResolvedValue(null);
  m.evaluateFreeText.mockResolvedValue({
    questionId: 'q1',
    type: 'free-text',
    score: 80,
    userAnswer: 'typed',
    explanation: '',
    chunkScores: { 'v1-c1': 80 },
    revisitNote: '',
  });
});

it('the start response body never carries expected answers, chunk tags, chunk text or context', async () => {
  const res = await startDebriefHandler(
    post('start', { courseSlug: 'c1', lessonSlug: 'l1' }),
  );
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).toContain('Why does the wing stall?');
  for (const secret of [
    'expectedAnswer',
    'SECRET-ANSWER',
    'chunkIds',
    'v1-c',
    'SECRET-SUMMARY',
    'SECRET-CONTEXT',
  ]) {
    expect(text).not.toContain(secret);
  }
});

describe('an open attempt whose source has disappeared (Review Focus 2)', () => {
  it('is still answered, graded from the stored question, chunks and context', async () => {
    const res = await answerDebriefHandler(
      post('answer', {
        courseSlug: 'c1',
        attemptId: 5,
        questionId: 'q1',
        answer: 'typed',
        metrics: {
          msOnQuestion: 1,
          msToFirstKey: 1,
          deletions: 0,
          charsDeleted: 0,
          rewrites: 0,
          pasteBlocked: 0,
          msHidden: 0,
          finalLength: 5,
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(m.evaluateFreeText).toHaveBeenCalledWith(
      question,
      'typed',
      chunks,
      'SECRET-CONTEXT',
    );
    expect(await res.json()).toMatchObject({
      evaluation: { score: 80, revisitNote: '' },
      finished: 'all-answered',
    });
  });
});
