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
    mastery: { chunkId: string; latestScore: number }[],
  ) =>
    `fp(${version}|${mastery.map((r) => `${r.chunkId}:${r.latestScore}`).join(',')})`,
  keyPointFocus: (chunkIds: string[]) => ({ holes: chunkIds, review: [] }),
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
/**
 * An attempt from before sets (no `sets`): it counts as one set of every
 * question.
 */
const stored = {
  lessonSlug: 'l1',
  questions: [q('q1', 'v1-c2'), q('q2', 'v1-c1')],
  chunks,
  context: 'SECRET-CONTEXT transcript',
};
/** A set-format attempt: set 1 is q1–q4, set 2 is q5–q6. */
const setChunks = Array.from({ length: 6 }, (_, i) => ({
  id: `v1-c${i + 1}`,
  title: `Key point ${i + 1}`,
  summary: `SECRET-SUMMARY-${i + 1}`,
}));
const setQuestions = setChunks.map((c, i) => q(`q${i + 1}`, c.id));
const setStored = {
  lessonSlug: 'l1',
  questions: setQuestions,
  chunks: setChunks,
  context: 'SECRET-CONTEXT transcript',
  sets: [
    ['q1', 'q2', 'q3', 'q4'],
    ['q5', 'q6'],
  ],
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
    feedback: `Viper on ${questionId}: ${score}.`,
    incorrectClaims: [],
  };
};
/** An answer on the set-format attempt: question qN tests chunk v1-cN. */
const scored = (n: number, score: number) =>
  evaluation(`q${n}`, { [`v1-c${n}`]: score });
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
        // An attempt from before sets is one set of every question.
        questions: [
          { id: 'q1', question: 'Question q1?', set: 1 },
          { id: 'q2', question: 'Question q2?', set: 1 },
        ],
        answered: [
          {
            questionId: 'q1',
            score: 40,
            feedback: 'Viper on q1: 40.',
            revisitNote: 'You missed the load factor.',
          },
        ],
        draft: { questionId: 'q2', text: 'half' },
      },
    });
    expect(m.generateTest).not.toHaveBeenCalled();
    expect(m.ensureLessonChunks).not.toHaveBeenCalled();
    expect(m.insertAttempt).not.toHaveBeenCalled();
  });

  it('starts fresh: generateTest gets the drawn key points (misses and unasked first), and the snapshot is stored with its sets', async () => {
    m.selectOpenAttempt.mockResolvedValue(null);
    m.ensureLessonChunks.mockResolvedValue({
      kind: 'ready',
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
      'fp(1|v1-c1:85)',
    );
    // c2 was never asked, so it is drawn before c1 (answered well).
    expect(m.generateTest).toHaveBeenCalledWith({
      lessonSlug: 'l1',
      chunks,
      context: stored.context,
      focus: { holes: ['v1-c2', 'v1-c1'], review: [] },
      avoidQuestions: ['Asked before?'],
    });
    // Everything grading needs, so it never re-resolves the source.
    expect(m.insertAttempt).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      stored: { ...stored, sets: [['q1', 'q2']] },
      chunkVersion: 1,
    });
    expect(r.ok && r.attempt.questions.map((x) => x.id)).toEqual(['q1', 'q2']);
  });

  it('serves the prepared test when its fingerprint matches, without generating', async () => {
    m.selectOpenAttempt.mockResolvedValue(null);
    m.ensureLessonChunks.mockResolvedValue({
      kind: 'ready',
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
      kind: 'ready',
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
    m.ensureLessonChunks.mockResolvedValue({ kind: 'no-source' });
    expect(await start()).toEqual({ ok: false, reason: 'no-source' });
    expect(m.insertAttempt).not.toHaveBeenCalled();
  });

  it('chunks still being generated by another request → busy, never no-source', async () => {
    m.selectOpenAttempt.mockResolvedValue(null);
    m.ensureLessonChunks.mockResolvedValue({ kind: 'busy' });
    expect(await start()).toEqual({ ok: false, reason: 'busy' });
    expect(m.generateTest).not.toHaveBeenCalled();
    expect(m.insertAttempt).not.toHaveBeenCalled();
  });

  it('splits eight questions into two sets of four', async () => {
    m.selectOpenAttempt.mockResolvedValue(null);
    m.ensureLessonChunks.mockResolvedValue({
      kind: 'ready',
      version: 1,
      chunks,
      context: 'c',
    });
    const eight = Array.from({ length: 8 }, (_, i) => q(`q${i + 1}`, 'v1-c1'));
    m.generateTest.mockResolvedValue({ lessonSlug: 'l1', questions: eight });
    m.insertAttempt.mockImplementation(async (v: { stored: unknown }) =>
      attemptRow({ questions: v.stored }),
    );
    const r = await start();
    expect(m.insertAttempt.mock.calls[0][0].stored.sets).toEqual([
      ['q1', 'q2', 'q3', 'q4'],
      ['q5', 'q6', 'q7', 'q8'],
    ]);
    // Set 2 never leaves the server before set 1 is missed.
    expect(r.ok && r.attempt.questions).toEqual(
      ['q1', 'q2', 'q3', 'q4'].map((id) => ({
        id,
        question: `Question ${id}?`,
        set: 1,
      })),
    );
  });

  it('every chunk already cleared still asks: clearing chunks is not a pass', async () => {
    m.selectOpenAttempt.mockResolvedValue(null);
    m.ensureLessonChunks.mockResolvedValue({
      kind: 'ready',
      version: 1,
      chunks,
      context: 'c',
    });
    m.selectMastery.mockResolvedValue(
      chunks.map((c) => ({ chunkId: c.id, latestScore: 90, clearedAt })),
    );
    m.generateTest.mockResolvedValue({
      lessonSlug: 'l1',
      questions: stored.questions,
    });
    m.insertAttempt.mockImplementation(async (v: { stored: unknown }) =>
      attemptRow({ questions: v.stored }),
    );
    expect((await start()).ok).toBe(true);
    expect(m.insertPass).not.toHaveBeenCalled();
    expect(m.generateTest.mock.calls[0][0].focus.holes).toHaveLength(2);
  });

  it('resuming after a missed set 1 shows set 2; after a passing or unfinished set 1 it does not', async () => {
    const view = async (answers: unknown[]) => {
      m.selectOpenAttempt.mockResolvedValue(
        attemptRow({ questions: setStored, answers }),
      );
      const r = await start();
      return r.ok ? r.attempt.questions.map((x) => `${x.id}/${x.set}`) : null;
    };
    const set1 = ['q1/1', 'q2/1', 'q3/1', 'q4/1'];
    expect(await view([scored(1, 40), scored(2, 40)])).toEqual(set1);
    expect(
      await view([scored(1, 40), scored(2, 40), scored(3, 40), scored(4, 40)]),
    ).toEqual([...set1, 'q5/2', 'q6/2']);
    expect(
      await view([scored(1, 100), scored(2, 80), scored(3, 80), scored(4, 40)]),
    ).toEqual(set1);
  });

  it('what reaches the client carries no expected answers, chunk tags, chunk text or context', async () => {
    m.selectOpenAttempt.mockResolvedValue(
      attemptRow({
        questions: setStored,
        answers: [1, 2, 3, 4].map((n) => scored(n, 40)),
      }),
    );
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

  it('reads the current chunk list FOR SHARE inside the answer transaction', async () => {
    await answer('q1');
    expect(m.selectCurrentChunks).toHaveBeenCalledWith(41, m.tx, {
      forShare: true,
    });
  });

  it('a replayed answer reports what it did when recorded: only the set-completing answer carries the set result and finish', async () => {
    m.row = attemptRow({
      answers: [
        evaluation('q1', { 'v1-c2': 40 }),
        evaluation('q2', { 'v1-c1': 90 }),
      ],
      completedAt: new Date('2026-11-12T01:00:00Z'),
      totalScore: 65,
      finishedReason: 'sets-missed',
    });
    expect(await answer('q1')).toMatchObject({
      ok: true,
      setResult: null,
      nextQuestions: [],
      finished: null,
    });
    expect(await answer('q2')).toEqual({
      ok: true,
      evaluation: {
        score: 90,
        feedback: 'Viper on q2: 90.',
        revisitNote: '',
      },
      setResult: { set: 1, average: 65, passed: false },
      nextQuestions: [],
      finished: 'sets-missed',
    });
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
  });

  it('a replay of the answer that missed set 1 returns set 2 again', async () => {
    m.row = attemptRow({
      questions: setStored,
      answers: [1, 2, 3, 4].map((n) => scored(n, 40)),
    });
    const r = await answer('q4');
    expect(r).toMatchObject({
      setResult: { set: 1, average: 40, passed: false },
      nextQuestions: [
        { id: 'q5', question: 'Question q5?', set: 2 },
        { id: 'q6', question: 'Question q6?', set: 2 },
      ],
      finished: null,
    });
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
  });

  it('a lost race on a non-finishing question does not report the finish a later answer caused', async () => {
    // While this tab graded q1, another recorded q1 AND then finished the
    // attempt on q2: theirs stands for q1, and q1 did not finish it.
    m.lockedRow = attemptRow({
      answers: [
        evaluation('q1', { 'v1-c2': 40 }),
        evaluation('q2', { 'v1-c1': 90 }),
      ],
      completedAt: new Date('2026-11-12T01:00:00Z'),
      totalScore: 65,
      finishedReason: 'sets-missed',
    });
    expect(await answer('q1')).toMatchObject({ ok: true, finished: null });
    expect(m.updateAttempt).not.toHaveBeenCalled();
  });

  it('a second tab that loses the race returns the winner’s evaluation and writes nothing', async () => {
    const winner = evaluation('q1', { 'v1-c2': 90 });
    // Graded, but by the time it locks the row the other tab has committed.
    m.lockedRow = attemptRow({ answers: [winner] });
    const r = await answer('q1');
    expect(r).toMatchObject({
      ok: true,
      evaluation: { score: 90, feedback: 'Viper on q1: 90.', revisitNote: '' },
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
      evaluation: {
        score: 40,
        feedback: 'Viper on q1: 40.',
        revisitNote: 'You missed the load factor.',
      },
      setResult: null,
      nextQuestions: [],
      finished: null,
    });
  });

  it('set 1 averaging 75 or more passes: set-passed at that average, a permanent pass, set 2 never asked', async () => {
    m.row = attemptRow({
      questions: setStored,
      answers: [scored(1, 100), scored(2, 80), scored(3, 50)],
    });
    m.evaluateFreeText.mockResolvedValue(scored(4, 80));
    const r = await answer('q4');
    expect(r).toMatchObject({
      ok: true,
      setResult: { set: 1, average: 78, passed: true },
      nextQuestions: [],
      finished: 'set-passed',
    });
    expect(m.insertPass).toHaveBeenCalledWith(m.tx, {
      userId: 'u1',
      lessonSlug: 'l1',
    });
    const set = m.updateAttempt.mock.calls[0][2];
    expect(set.completedAt).toBeInstanceOf(Date);
    expect(set.totalScore).toBe(78);
    expect(set.finishedReason).toBe('set-passed');
    expect(m.waitUntil).not.toHaveBeenCalled();
    expect(await answer('q5')).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('set 1 under 75 opens set 2: its questions come back, the attempt goes on', async () => {
    m.row = attemptRow({
      questions: setStored,
      answers: [scored(1, 100), scored(2, 80), scored(3, 50)],
    });
    m.evaluateFreeText.mockResolvedValue(scored(4, 40));
    const r = await answer('q4');
    expect(r).toEqual({
      ok: true,
      evaluation: {
        score: 40,
        feedback: 'Viper on q4: 40.',
        revisitNote: 'You missed the load factor.',
      },
      setResult: { set: 1, average: 68, passed: false },
      nextQuestions: [
        { id: 'q5', question: 'Question q5?', set: 2 },
        { id: 'q6', question: 'Question q6?', set: 2 },
      ],
      finished: null,
    });
    const set = m.updateAttempt.mock.calls[0][2];
    expect(set.completedAt).toBeUndefined();
    expect(set.finishedReason).toBeUndefined();
    expect(m.insertPass).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain('SECRET-ANSWER');
  });

  it('set 2 is judged on its own: a passing set 2 passes whatever set 1 scored', async () => {
    m.row = attemptRow({
      questions: setStored,
      answers: [...[1, 2, 3, 4].map((n) => scored(n, 0)), scored(5, 80)],
    });
    m.evaluateFreeText.mockResolvedValue(scored(6, 70));
    const r = await answer('q6');
    expect(r).toMatchObject({
      setResult: { set: 2, average: 75, passed: true },
      finished: 'set-passed',
    });
    expect(m.updateAttempt.mock.calls[0][2].totalScore).toBe(75);
    expect(m.insertPass).toHaveBeenCalledOnce();
  });

  it('the last set under 75 finishes sets-missed at its average, with no pass, and prepares the next attempt', async () => {
    m.row = attemptRow({
      questions: setStored,
      answers: [...[1, 2, 3, 4].map((n) => scored(n, 40)), scored(5, 80)],
    });
    m.evaluateFreeText.mockResolvedValue(scored(6, 60));
    const r = await answer('q6');
    expect(r).toMatchObject({
      ok: true,
      setResult: { set: 2, average: 70, passed: false },
      nextQuestions: [],
      finished: 'sets-missed',
    });
    const set = m.updateAttempt.mock.calls[0][2];
    expect(set.totalScore).toBe(70);
    expect(set.finishedReason).toBe('sets-missed');
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

  it('an attempt from before sets is one set: it finishes on its last answer, passing at 75', async () => {
    m.row = attemptRow({ answers: [evaluation('q1', { 'v1-c2': 70 })] });
    m.evaluateFreeText.mockResolvedValue(evaluation('q2', { 'v1-c1': 80 }));
    expect(await answer('q2')).toMatchObject({
      setResult: { set: 1, average: 75, passed: true },
      finished: 'set-passed',
    });
    expect(m.insertPass).toHaveBeenCalledOnce();
  });

  it('a half-answered set reports nothing about the set', async () => {
    m.row = attemptRow({ questions: setStored });
    m.evaluateFreeText.mockResolvedValue(scored(1, 100));
    expect(await answer('q1')).toMatchObject({
      setResult: null,
      nextQuestions: [],
      finished: null,
    });
    expect(m.updateAttempt.mock.calls[0][2].completedAt).toBeUndefined();
  });

  it('within set 2, questions are still answered in order', async () => {
    m.row = attemptRow({
      questions: setStored,
      answers: [1, 2, 3, 4].map((n) => scored(n, 40)),
    });
    expect(await answer('q6')).toEqual({ ok: false, reason: 'out-of-order' });
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
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
