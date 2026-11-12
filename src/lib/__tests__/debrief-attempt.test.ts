// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  tx: { tag: 'tx' },
  /** The one attempt row the db stubs read and write. */
  row: null as Record<string, unknown> | null,
  /** What `lockAttempt` sees, when a test wants it to differ from `row`. */
  lockedRow: undefined as Record<string, unknown> | null | undefined,
  selectOpenAttempt: vi.fn(),
  insertAttempt: vi.fn(),
  selectAttempt: vi.fn(),
  lockAttempt: vi.fn(),
  updateAttempt: vi.fn(),
  selectCurrentChunks: vi.fn(),
  selectMastery: vi.fn(),
  upsertMastery: vi.fn(),
  insertAnswerLog: vi.fn(),
  insertPass: vi.fn(),
  updateDraft: vi.fn(),
  selectAskedQuestions: vi.fn(),
  ensureLessonChunks: vi.fn(),
  mapToCurrentChunkIds: vi.fn(),
  takePreparedDebrief: vi.fn(),
  prepareDebrief: vi.fn(),
  generateTest: vi.fn(),
  evaluateFreeText: vi.fn(),
  resolveDebriefSource: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock('#/db', () => ({
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(m.tx),
  },
}));
vi.mock('#/db/debrief-attempts', () => ({
  selectOpenAttempt: m.selectOpenAttempt,
  insertAttempt: m.insertAttempt,
  selectAttempt: m.selectAttempt,
  lockAttempt: m.lockAttempt,
  updateAttempt: m.updateAttempt,
  selectCurrentChunks: m.selectCurrentChunks,
  selectMastery: m.selectMastery,
  upsertMastery: m.upsertMastery,
  insertAnswerLog: m.insertAnswerLog,
  insertPass: m.insertPass,
  updateDraft: m.updateDraft,
  selectAskedQuestions: m.selectAskedQuestions,
}));
vi.mock('#/lib/knowledge-chunks.server', () => ({
  ensureLessonChunks: m.ensureLessonChunks,
  mapToCurrentChunkIds: m.mapToCurrentChunkIds,
}));
vi.mock('#/lib/prepared-debrief.server', () => ({
  takePreparedDebrief: m.takePreparedDebrief,
  prepareDebrief: m.prepareDebrief,
  preparedFingerprint: (
    version: number,
    focus: { holes: string[]; review: string[] },
  ) => `fp(${version}|${focus.holes.join(',')}|${focus.review.join(',')})`,
}));
vi.mock('#/ai/generate-test', () => ({ generateTest: m.generateTest }));
vi.mock('#/ai/evaluate-answer', () => ({
  evaluateFreeText: m.evaluateFreeText,
}));
vi.mock('#/lib/lesson-debrief-source.server', () => ({
  resolveDebriefSource: m.resolveDebriefSource,
}));
vi.mock('@vercel/functions', () => ({ waitUntil: m.waitUntil }));

import {
  answerQuestion,
  saveDraft,
  startOrResumeAttempt,
} from '../debrief-attempt.server';

const chunks = [
  { id: 'v1-c1', title: 'Stall AoA', summary: 'SECRET-SUMMARY-1' },
  { id: 'v1-c2', title: 'Load factor', summary: 'SECRET-SUMMARY-2' },
];
const q = (id: string, chunkId: string) => ({
  id,
  type: 'free-text' as const,
  question: `Question ${id}?`,
  expectedAnswer: `SECRET-ANSWER-${id}`,
  chunkIds: [chunkId],
});
/** q1 asks about the hole (c2), q2 is spaced review of cleared c1. */
const stored = {
  lessonSlug: 'l1',
  questions: [q('q1', 'v1-c2'), q('q2', 'v1-c1')],
  chunks,
  context: 'SECRET-CONTEXT transcript',
};
const attemptRow = (over: Record<string, unknown> = {}) => ({
  id: 5,
  userId: 'u1',
  lessonSlug: 'l1',
  questions: stored,
  answers: [],
  totalScore: null,
  completedAt: null,
  createdAt: new Date('2026-11-12T00:00:00Z'),
  format: 'knowledge-chunks-v1',
  chunkVersion: 1,
  draft: null,
  finishedReason: null,
  ...over,
});
const clearedAt = new Date('2026-11-10T00:00:00Z');
const evaluation = (
  questionId: string,
  chunkScores: Record<string, number>,
) => {
  const score = Math.round(
    Object.values(chunkScores).reduce((a, b) => a + b, 0) /
      Object.values(chunkScores).length,
  );
  return {
    questionId,
    type: 'free-text' as const,
    score,
    userAnswer: 'typed',
    explanation: score >= 70 ? '' : 'You missed the load factor.',
    chunkScores,
    revisitNote: score >= 70 ? '' : 'You missed the load factor.',
    incorrectClaims: [],
  };
};
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
const answer = (questionId: string, over: Record<string, unknown> = {}) =>
  answerQuestion({
    userId: 'u1',
    attemptId: 5,
    questionId,
    answer: 'typed',
    metrics,
    lessonId: 41,
    courseId: 7,
    ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.row = attemptRow();
  m.lockedRow = undefined;
  const copy = () => (m.row ? structuredClone(m.row) : null);
  m.selectAttempt.mockImplementation(async () => copy());
  m.lockAttempt.mockImplementation(async () =>
    m.lockedRow === undefined ? copy() : m.lockedRow,
  );
  m.updateAttempt.mockImplementation(
    async (_tx: unknown, _id: number, set: Record<string, unknown>) => {
      m.row = { ...(m.row ?? {}), ...set };
    },
  );
  m.selectCurrentChunks.mockResolvedValue({
    version: 1,
    chunks,
    previousMapping: null,
  });
  // c1 already cleared; c2 is the hole.
  m.selectMastery.mockResolvedValue([
    { chunkId: 'v1-c1', latestScore: 85, clearedAt },
  ]);
  // Same-version ids pass straight through (the real rule for this case).
  m.mapToCurrentChunkIds.mockImplementation(
    (scores: Record<string, number>) => scores,
  );
  m.evaluateFreeText.mockResolvedValue(evaluation('q1', { 'v1-c2': 40 }));
  m.resolveDebriefSource.mockResolvedValue(null);
  m.prepareDebrief.mockResolvedValue('prepared');
  m.selectAskedQuestions.mockResolvedValue(['Asked before?']);
  m.takePreparedDebrief.mockResolvedValue(null);
});

describe('startOrResumeAttempt', () => {
  const start = () =>
    startOrResumeAttempt({
      userId: 'u1',
      courseId: 7,
      lessonId: 41,
      lessonSlug: 'l1',
    });

  it('resumes an unfinished attempt: its stored questions, answers and draft, and no generation', async () => {
    m.selectOpenAttempt.mockResolvedValue(
      attemptRow({
        answers: [evaluation('q1', { 'v1-c2': 40 })],
        draft: { questionId: 'q2', text: 'half' },
      }),
    );
    const r = await start();
    expect(m.selectOpenAttempt).toHaveBeenCalledWith('u1', 'l1');
    expect(r).toEqual({
      ok: true,
      attempt: {
        attemptId: 5,
        questions: [
          { id: 'q1', question: 'Question q1?' },
          { id: 'q2', question: 'Question q2?' },
        ],
        answered: [
          {
            questionId: 'q1',
            score: 40,
            revisitNote: 'You missed the load factor.',
          },
        ],
        draft: { questionId: 'q2', text: 'half' },
        mastery: { cleared: 1, total: 2 },
      },
    });
    expect(m.generateTest).not.toHaveBeenCalled();
    expect(m.ensureLessonChunks).not.toHaveBeenCalled();
    expect(m.insertAttempt).not.toHaveBeenCalled();
  });

  it('starts fresh: generateTest gets the focus planAttemptFocus derives from mastery, and the snapshot is stored', async () => {
    m.selectOpenAttempt.mockResolvedValue(null);
    m.ensureLessonChunks.mockResolvedValue({
      version: 1,
      chunks,
      context: stored.context,
    });
    m.generateTest.mockResolvedValue({
      lessonSlug: 'l1',
      questions: stored.questions,
    });
    m.insertAttempt.mockImplementation(async (v: { stored: unknown }) =>
      attemptRow({ questions: v.stored }),
    );

    const r = await start();
    expect(m.ensureLessonChunks).toHaveBeenCalledWith(41, 'l1', 7);
    expect(m.selectMastery).toHaveBeenCalledWith('u1', 41);
    expect(m.takePreparedDebrief).toHaveBeenCalledWith(
      { userId: 'u1', courseId: 7, lessonSlug: 'l1' },
      'fp(1|v1-c2|v1-c1)',
    );
    expect(m.generateTest).toHaveBeenCalledWith({
      lessonSlug: 'l1',
      chunks,
      context: stored.context,
      focus: { holes: ['v1-c2'], review: ['v1-c1'] },
      avoidQuestions: ['Asked before?'],
    });
    // Everything grading needs, so it never re-resolves the source.
    expect(m.insertAttempt).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      stored,
      chunkVersion: 1,
    });
    expect(r.ok && r.attempt.questions.map((x) => x.id)).toEqual(['q1', 'q2']);
  });

  it('serves the prepared test when its fingerprint matches, without generating', async () => {
    m.selectOpenAttempt.mockResolvedValue(null);
    m.ensureLessonChunks.mockResolvedValue({
      version: 1,
      chunks,
      context: 'c',
    });
    m.takePreparedDebrief.mockResolvedValue({
      lessonSlug: 'l1',
      questions: [q('q1', 'v1-c2')],
    });
    m.insertAttempt.mockImplementation(async (v: { stored: unknown }) =>
      attemptRow({ questions: v.stored }),
    );
    await start();
    expect(m.generateTest).not.toHaveBeenCalled();
    expect(m.insertAttempt.mock.calls[0][0].stored.questions).toEqual([
      q('q1', 'v1-c2'),
    ]);
  });

  it('a concurrent start that lost the insert resumes the winner’s attempt', async () => {
    m.selectOpenAttempt
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(attemptRow({ id: 77 }));
    m.ensureLessonChunks.mockResolvedValue({
      version: 1,
      chunks,
      context: 'c',
    });
    m.generateTest.mockResolvedValue({
      lessonSlug: 'l1',
      questions: stored.questions,
    });
    m.insertAttempt.mockResolvedValue(null);
    const r = await start();
    expect(r.ok && r.attempt.attemptId).toBe(77);
  });

  it('no chunks (no debrief source) → no-source, nothing stored', async () => {
    m.selectOpenAttempt.mockResolvedValue(null);
    m.ensureLessonChunks.mockResolvedValue(null);
    expect(await start()).toEqual({ ok: false, reason: 'no-source' });
    expect(m.insertAttempt).not.toHaveBeenCalled();
  });

  it('every current chunk already cleared (e.g. carried over) → records the pass instead of asking', async () => {
    m.selectOpenAttempt.mockResolvedValue(null);
    m.ensureLessonChunks.mockResolvedValue({
      version: 1,
      chunks,
      context: 'c',
    });
    m.selectMastery.mockResolvedValue(
      chunks.map((c) => ({ chunkId: c.id, latestScore: 90, clearedAt })),
    );
    expect(await start()).toEqual({ ok: false, reason: 'passed' });
    expect(m.insertPass).toHaveBeenCalledWith(m.tx, {
      userId: 'u1',
      lessonSlug: 'l1',
    });
    expect(m.generateTest).not.toHaveBeenCalled();
  });

  it('what reaches the client carries no expected answers, chunk tags, chunk text or context', async () => {
    m.selectOpenAttempt.mockResolvedValue(attemptRow());
    const body = JSON.stringify(await start());
    for (const secret of [
      'expectedAnswer',
      'SECRET-ANSWER',
      'chunkIds',
      'v1-c',
      'SECRET-SUMMARY',
      'SECRET-CONTEXT',
    ]) {
      expect(body).not.toContain(secret);
    }
  });
});

describe('answerQuestion', () => {
  it('grades from the STORED attempt even when the source is gone (Review Focus 2)', async () => {
    const r = await answer('q1');
    expect(r.ok).toBe(true);
    expect(m.evaluateFreeText).toHaveBeenCalledWith(
      q('q1', 'v1-c2'),
      'typed',
      chunks,
      stored.context,
    );
    expect(m.resolveDebriefSource).not.toHaveBeenCalled();
    expect(m.ensureLessonChunks).not.toHaveBeenCalled();
  });

  it('the same question twice grades and counts once; the repeat returns the stored evaluation (Review Focus 1)', async () => {
    const first = await answer('q1');
    const second = await answer('q1');
    expect(m.evaluateFreeText).toHaveBeenCalledOnce();
    expect(m.upsertMastery).toHaveBeenCalledOnce();
    expect(m.insertAnswerLog).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
    expect(m.row?.answers).toHaveLength(1);
  });

  it('a second tab that loses the race returns the winner’s evaluation and writes nothing', async () => {
    const winner = evaluation('q1', { 'v1-c2': 90 });
    // Graded, but by the time it locks the row the other tab has committed.
    m.lockedRow = attemptRow({ answers: [winner] });
    const r = await answer('q1');
    expect(r).toMatchObject({
      ok: true,
      evaluation: { score: 90, revisitNote: '' },
    });
    expect(m.updateAttempt).not.toHaveBeenCalled();
    expect(m.upsertMastery).not.toHaveBeenCalled();
    expect(m.insertAnswerLog).not.toHaveBeenCalled();
  });

  it('records the answer: mastery upsert, answer appended, draft cleared, metrics logged', async () => {
    m.row = attemptRow({ draft: { questionId: 'q1', text: 'typ' } });
    const r = await answer('q1');
    expect(m.upsertMastery).toHaveBeenCalledWith(m.tx, [
      {
        userId: 'u1',
        lessonId: 41,
        chunkId: 'v1-c2',
        latestScore: 40,
        clearedAt: null,
      },
    ]);
    const set = m.updateAttempt.mock.calls[0][2];
    expect(m.updateAttempt.mock.calls[0][1]).toBe(5);
    expect(set.answers).toEqual([evaluation('q1', { 'v1-c2': 40 })]);
    expect(set.draft).toBeNull();
    expect(set.completedAt).toBeUndefined();
    expect(m.insertAnswerLog).toHaveBeenCalledWith(m.tx, {
      attemptId: 5,
      questionId: 'q1',
      metrics,
    });
    expect(r).toEqual({
      ok: true,
      evaluation: { score: 40, revisitNote: 'You missed the load factor.' },
      mastery: { cleared: 1, total: 2, percent: 50 },
      finished: null,
    });
  });

  it('clearing the last hole ends the attempt at once: all-cleared, 100, and a permanent pass', async () => {
    m.evaluateFreeText.mockResolvedValue(evaluation('q1', { 'v1-c2': 80 }));
    const r = await answer('q1');
    expect(r).toMatchObject({
      ok: true,
      mastery: { cleared: 2, total: 2, percent: 100 },
      finished: 'all-cleared',
    });
    expect(m.insertPass).toHaveBeenCalledWith(m.tx, {
      userId: 'u1',
      lessonSlug: 'l1',
    });
    const set = m.updateAttempt.mock.calls[0][2];
    expect(set.completedAt).toBeInstanceOf(Date);
    expect(set.totalScore).toBe(100);
    expect(set.finishedReason).toBe('all-cleared');
    // q2 (review) is never required: the attempt is finished.
    expect(await answer('q2')).toEqual({ ok: false, reason: 'forbidden' });
    expect(m.evaluateFreeText).toHaveBeenCalledOnce();
  });

  it('a weak answer on an already-cleared chunk keeps it cleared', async () => {
    m.row = attemptRow({ answers: [evaluation('q1', { 'v1-c2': 40 })] });
    m.evaluateFreeText.mockResolvedValue(evaluation('q2', { 'v1-c1': 10 }));
    await answer('q2');
    expect(m.upsertMastery).toHaveBeenCalledWith(m.tx, [
      {
        userId: 'u1',
        lessonId: 41,
        chunkId: 'v1-c1',
        latestScore: 10,
        clearedAt,
      },
    ]);
  });

  it('answering the last question with holes left finishes all-answered at mastery percent, and prepares the next attempt', async () => {
    m.row = attemptRow({ answers: [evaluation('q1', { 'v1-c2': 40 })] });
    m.evaluateFreeText.mockResolvedValue(evaluation('q2', { 'v1-c1': 90 }));
    const r = await answer('q2');
    expect(r).toMatchObject({
      ok: true,
      mastery: { cleared: 1, total: 2, percent: 50 },
      finished: 'all-answered',
    });
    const set = m.updateAttempt.mock.calls[0][2];
    expect(set.totalScore).toBe(50);
    expect(set.finishedReason).toBe('all-answered');
    expect(set.completedAt).toBeInstanceOf(Date);
    expect(m.insertPass).not.toHaveBeenCalled();
    expect(m.prepareDebrief).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      lessonSlug: 'l1',
      lessonId: 41,
    });
    expect(m.waitUntil).toHaveBeenCalledOnce();
  });

  it('scores from an attempt on the previous chunk version are mapped onto the current ids', async () => {
    m.selectCurrentChunks.mockResolvedValue({
      version: 2,
      chunks: [
        { id: 'v2-c1', title: 'a', summary: '' },
        { id: 'v2-c2', title: 'b', summary: '' },
      ],
      previousMapping: { 'v1-c1': 'v2-c1', 'v1-c2': 'v2-c2' },
    });
    m.selectMastery.mockResolvedValue([]);
    m.mapToCurrentChunkIds.mockReturnValue({ 'v2-c2': 40 });
    await answer('q1');
    expect(m.mapToCurrentChunkIds).toHaveBeenCalledWith(
      { 'v1-c2': 40 },
      { 'v1-c1': 'v2-c1', 'v1-c2': 'v2-c2' },
      2,
    );
    expect(m.upsertMastery.mock.calls[0][1][0].chunkId).toBe('v2-c2');
  });

  it('an id that maps to nothing updates no mastery (it stays on the attempt)', async () => {
    m.mapToCurrentChunkIds.mockReturnValue({});
    await answer('q1');
    expect(m.upsertMastery).not.toHaveBeenCalled();
    expect(m.updateAttempt.mock.calls[0][2].answers[0].chunkScores).toEqual({
      'v1-c2': 40,
    });
  });

  it('questions are answered in order: a later one is refused without grading', async () => {
    expect(await answer('q2')).toEqual({ ok: false, reason: 'out-of-order' });
    expect(await answer('q9')).toEqual({ ok: false, reason: 'out-of-order' });
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
  });

  it.each([
    ['another pilot’s attempt', { userId: 'u2' }],
    ['a legacy attempt', { format: null }],
    ['a finished attempt', { completedAt: new Date() }],
  ])('refuses %s without grading', async (_why, over) => {
    m.row = attemptRow(over);
    expect(await answer('q1')).toEqual({ ok: false, reason: 'forbidden' });
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
  });

  it('refuses an attempt that does not exist', async () => {
    m.row = null;
    expect(await answer('q1')).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('saveDraft', () => {
  const draft = (questionId: string, text = 'half') =>
    saveDraft({ userId: 'u1', attemptId: 5, questionId, text });

  it('writes the draft for the current question, capped at 10,000 characters', async () => {
    m.updateDraft.mockResolvedValue(true);
    expect(await draft('q1', 'x'.repeat(12_000))).toBe('saved');
    expect(m.updateDraft).toHaveBeenCalledWith('u1', 5, {
      questionId: 'q1',
      text: 'x'.repeat(10_000),
    });
  });

  it('the current question is the first unanswered one', async () => {
    m.row = attemptRow({ answers: [evaluation('q1', { 'v1-c2': 40 })] });
    m.updateDraft.mockResolvedValue(true);
    expect(await draft('q2')).toBe('saved');
  });

  it.each([
    ['a later question', 'q2'],
    ['a question not in the attempt', 'q9'],
  ])('refuses %s without writing', async (_why, questionId) => {
    expect(await draft(questionId)).toBe('wrong-question');
    expect(m.updateDraft).not.toHaveBeenCalled();
  });

  it('refuses a question already answered', async () => {
    m.row = attemptRow({ answers: [evaluation('q1', { 'v1-c2': 40 })] });
    expect(await draft('q1')).toBe('wrong-question');
    expect(m.updateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['another pilot’s attempt', { userId: 'u2' }],
    ['a finished attempt', { completedAt: new Date() }],
    ['a legacy attempt', { format: null }],
  ])('forbids %s', async (_why, over) => {
    m.row = attemptRow(over);
    expect(await draft('q1')).toBe('forbidden');
    expect(m.updateDraft).not.toHaveBeenCalled();
  });

  it('forbidden when the guarded write matched nothing (finished meanwhile)', async () => {
    m.updateDraft.mockResolvedValue(false);
    expect(await draft('q1')).toBe('forbidden');
  });
});
