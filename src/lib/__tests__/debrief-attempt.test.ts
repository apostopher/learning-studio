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
  getScoreFacts: vi.fn(),
  getCoursePassMark: vi.fn(),
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
vi.mock('#/lib/lesson-score.server', () => ({
  getScoreFacts: m.getScoreFacts,
  getCoursePassMark: m.getCoursePassMark,
}));

import {
  answerQuestion,
  continueAttempt,
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
/** The only part of a lesson with no video and no quiz. */
const debriefPart = (average: number) => ({
  part: 'debrief',
  weight: 100,
  fraction: average / 100,
  points: expect.closeTo(average),
});
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
  // No video, no quiz, pass mark 75: the debrief is the whole score, so a set
  // passes at an average of 75 (the cases below that predate the lesson
  // total). The lesson-total cases set their own facts.
  m.getScoreFacts.mockResolvedValue({ video: null, quiz: null });
  m.getCoursePassMark.mockResolvedValue(75);
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
        offer: false,
        setResults: [],
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
      setResult: {
        set: 1,
        average: 65,
        passed: false,
        score: {
          total: expect.closeTo(65),
          passMark: 75,
          passed: false,
          parts: [debriefPart(65)],
        },
      },
      nextQuestions: [],
      offer: false,
      passedNow: false,
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
      offer: false,
      passedNow: false,
      finished: null,
    });
  });

  it('a passing set 1 with a set 2 records the pass and offers set 2: the attempt stays open, set 2 unasked', async () => {
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
      offer: true,
      passedNow: true,
      finished: null,
    });
    expect(m.insertPass).toHaveBeenCalledWith(m.tx, {
      userId: 'u1',
      lessonSlug: 'l1',
    });
    const set = m.updateAttempt.mock.calls[0][2];
    expect(set.completedAt).toBeUndefined();
    expect(set.finishedReason).toBeUndefined();
    expect(m.waitUntil).not.toHaveBeenCalled();
    // Set 2 is not reached until the pilot takes up the offer.
    expect(await answer('q5')).toEqual({ ok: false, reason: 'out-of-order' });
    expect(m.evaluateFreeText).toHaveBeenCalledOnce();
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
      setResult: {
        set: 1,
        average: 68,
        passed: false,
        score: {
          total: expect.closeTo(68),
          passMark: 75,
          passed: false,
          parts: [debriefPart(68)],
        },
      },
      nextQuestions: [
        { id: 'q5', question: 'Question q5?', set: 2 },
        { id: 'q6', question: 'Question q6?', set: 2 },
      ],
      offer: false,
      passedNow: false,
      finished: null,
    });
    const set = m.updateAttempt.mock.calls[0][2];
    expect(set.completedAt).toBeUndefined();
    expect(set.finishedReason).toBeUndefined();
    expect(m.insertPass).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain('SECRET-ANSWER');
  });

  it('a passing set 2 passes whatever set 1 scored, and records the pass', async () => {
    m.row = attemptRow({
      questions: setStored,
      answers: [...[1, 2, 3, 4].map((n) => scored(n, 0)), scored(5, 80)],
    });
    m.evaluateFreeText.mockResolvedValue(scored(6, 70));
    const r = await answer('q6');
    expect(r).toMatchObject({
      setResult: { set: 2, average: 75, passed: true },
      passedNow: true,
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

/**
 * Judged on the lesson total: video and quiz full, pass mark 85, so the
 * debrief's quarter must bring 35 — a set passes at an average of 40.
 */
describe('sets judged on the lesson total against the course pass mark', () => {
  const eightChunks = Array.from({ length: 8 }, (_, i) => ({
    id: `v1-c${i + 1}`,
    title: `Key point ${i + 1}`,
    summary: `SECRET-SUMMARY-${i + 1}`,
  }));
  const eightStored = {
    lessonSlug: 'l1',
    questions: eightChunks.map((c, i) => q(`q${i + 1}`, c.id)),
    chunks: eightChunks,
    context: 'SECRET-CONTEXT transcript',
    sets: [
      ['q1', 'q2', 'q3', 'q4'],
      ['q5', 'q6', 'q7', 'q8'],
    ],
  };
  const fourStored = {
    ...eightStored,
    questions: eightStored.questions.slice(0, 4),
    sets: [['q1', 'q2', 'q3', 'q4']],
  };
  const all = (from: number, to: number, score: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => scored(from + i, score));
  const set2 = ['q5', 'q6', 'q7', 'q8'].map((id) => ({
    id,
    question: `Question ${id}?`,
    set: 2,
  }));

  beforeEach(() => {
    m.getScoreFacts.mockResolvedValue({ video: 1, quiz: 1 });
    m.getCoursePassMark.mockResolvedValue(85);
  });

  it('reads the facts for this pilot and lesson, and the pass mark of the route’s course', async () => {
    m.row = attemptRow({ questions: eightStored, answers: all(1, 3, 50) });
    m.evaluateFreeText.mockResolvedValue(scored(4, 50));
    await answer('q4');
    expect(m.getScoreFacts).toHaveBeenCalledWith('u1', 'l1', 41);
    expect(m.getCoursePassMark).toHaveBeenCalledWith(7);
  });

  it('set 1 passing at 50 with a set 2: the pass is recorded, the attempt stays open, set 2 is offered', async () => {
    m.row = attemptRow({ questions: eightStored, answers: all(1, 3, 50) });
    m.evaluateFreeText.mockResolvedValue(scored(4, 50));
    const r = await answer('q4');
    expect(m.insertPass).toHaveBeenCalledOnce();
    expect(m.insertPass).toHaveBeenCalledWith(m.tx, {
      userId: 'u1',
      lessonSlug: 'l1',
    });
    expect(m.updateAttempt).toHaveBeenCalledOnce();
    expect(m.updateAttempt.mock.calls[0][2]).not.toHaveProperty('completedAt');
    expect(r).toMatchObject({
      ok: true,
      offer: true,
      passedNow: true,
      finished: null,
      nextQuestions: [],
      setResult: { set: 1, average: 50, passed: true },
    });
    expect(r.ok && r.setResult?.score.total).toBeCloseTo(87.5);
    expect(r.ok && r.setResult?.score.passMark).toBe(85);
    expect(m.waitUntil).not.toHaveBeenCalled();
  });

  it('set 1 passing at 50 with no set 2 finishes set-passed at 50, no offer', async () => {
    m.row = attemptRow({ questions: fourStored, answers: all(1, 3, 50) });
    m.evaluateFreeText.mockResolvedValue(scored(4, 50));
    const r = await answer('q4');
    expect(m.updateAttempt.mock.calls[0][2]).toMatchObject({
      completedAt: expect.any(Date),
      finishedReason: 'set-passed',
      totalScore: 50,
    });
    expect(r).toMatchObject({
      offer: false,
      passedNow: true,
      finished: 'set-passed',
    });
    expect(m.insertPass).toHaveBeenCalledOnce();
  });

  it('set 1 at 30 misses: no pass, set 2 comes back, no offer', async () => {
    m.row = attemptRow({ questions: eightStored, answers: all(1, 3, 30) });
    m.evaluateFreeText.mockResolvedValue(scored(4, 30));
    const r = await answer('q4');
    expect(m.insertPass).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      offer: false,
      passedNow: false,
      finished: null,
      nextQuestions: set2,
      setResult: { set: 1, average: 30, passed: false },
    });
  });

  it('set 2 at 35 after set 1 at 30 finishes sets-missed at the better, 35, and prepares the next attempt', async () => {
    m.row = attemptRow({
      questions: eightStored,
      answers: [...all(1, 4, 30), ...all(5, 7, 35)],
    });
    m.evaluateFreeText.mockResolvedValue(scored(8, 35));
    const r = await answer('q8');
    expect(m.updateAttempt.mock.calls[0][2]).toMatchObject({
      completedAt: expect.any(Date),
      finishedReason: 'sets-missed',
      totalScore: 35,
    });
    expect(r).toMatchObject({ finished: 'sets-missed', passedNow: false });
    expect(m.insertPass).not.toHaveBeenCalled();
    expect(m.prepareDebrief).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      lessonSlug: 'l1',
      lessonId: 41,
    });
    expect(m.waitUntil).toHaveBeenCalledOnce();
  });

  it('set 2 is judged on the better average: 30 then 45 passes on 45', async () => {
    m.row = attemptRow({
      questions: eightStored,
      answers: [...all(1, 4, 30), ...all(5, 7, 45)],
    });
    m.evaluateFreeText.mockResolvedValue(scored(8, 45));
    const r = await answer('q8');
    expect(r).toMatchObject({
      finished: 'set-passed',
      passedNow: true,
      setResult: { set: 2, average: 45, passed: true },
    });
    expect(m.updateAttempt.mock.calls[0][2].totalScore).toBe(45);
    expect(m.insertPass).toHaveBeenCalledOnce();
  });

  it('a quiz not taken (quiz 0) and 60 on the debrief totals 65: not passed', async () => {
    m.getScoreFacts.mockResolvedValue({ video: 1, quiz: 0 });
    m.row = attemptRow({ questions: fourStored, answers: all(1, 3, 60) });
    m.evaluateFreeText.mockResolvedValue(scored(4, 60));
    const r = await answer('q4');
    expect(r.ok && r.setResult?.score.total).toBeCloseTo(65);
    expect(r).toMatchObject({
      setResult: { set: 1, average: 60, passed: false },
      passedNow: false,
      finished: 'sets-missed',
    });
    expect(m.insertPass).not.toHaveBeenCalled();
  });

  it('the judge counts the debrief even when the lesson’s debrief switch is off', async () => {
    // getScoreFacts carries no debrief switch: the judge always adds the part.
    m.getScoreFacts.mockResolvedValue({ video: 1, quiz: null });
    m.row = attemptRow({ questions: fourStored, answers: all(1, 3, 69) });
    m.evaluateFreeText.mockResolvedValue(scored(4, 69));
    const r = await answer('q4');
    // 50 + 50 × 0.69 = 84.5 < 85.
    expect(r).toMatchObject({ finished: 'sets-missed' });
    expect(r.ok && r.setResult?.score.total).toBeCloseTo(84.5);
  });

  it('a replay of the passing answer reports the offer again, with no second pass', async () => {
    m.row = attemptRow({ questions: eightStored, answers: all(1, 4, 50) });
    const r = await answer('q4');
    expect(r).toMatchObject({
      ok: true,
      offer: true,
      passedNow: false,
      finished: null,
      setResult: { set: 1, average: 50, passed: true },
    });
    expect(r.ok && r.setResult?.score.total).toBeCloseTo(87.5);
    expect(m.insertPass).not.toHaveBeenCalled();
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
  });

  it('the replay reads the same after the offer was taken up', async () => {
    m.row = attemptRow({
      questions: { ...eightStored, improveAccepted: true },
      answers: all(1, 4, 50),
    });
    expect(await answer('q4')).toMatchObject({
      offer: true,
      passedNow: false,
      nextQuestions: [],
    });
  });

  it('a lost race on the passing answer returns the winner’s offer, passedNow false, and writes nothing', async () => {
    m.row = attemptRow({ questions: eightStored, answers: all(1, 3, 50) });
    m.lockedRow = attemptRow({
      questions: eightStored,
      answers: all(1, 4, 50),
    });
    m.evaluateFreeText.mockResolvedValue(scored(4, 50));
    const r = await answer('q4');
    expect(r).toMatchObject({ offer: true, passedNow: false, finished: null });
    expect(m.insertPass).not.toHaveBeenCalled();
    expect(m.updateAttempt).not.toHaveBeenCalled();
  });

  it('with the offer pending, set 2 cannot be answered', async () => {
    m.row = attemptRow({ questions: eightStored, answers: all(1, 4, 50) });
    expect(await answer('q5')).toEqual({ ok: false, reason: 'out-of-order' });
    expect(m.evaluateFreeText).not.toHaveBeenCalled();
  });

  it('after the offer is taken up, set 2 is answered; finishing it on the better average re-records the pass but is not a new one', async () => {
    m.row = attemptRow({
      questions: { ...eightStored, improveAccepted: true },
      answers: [...all(1, 4, 50), ...all(5, 7, 90)],
    });
    m.evaluateFreeText.mockResolvedValue(scored(8, 90));
    const r = await answer('q8');
    expect(r).toMatchObject({
      offer: false,
      passedNow: false,
      finished: 'set-passed',
      setResult: { set: 2, average: 90, passed: true },
    });
    expect(r.ok && r.setResult?.score.total).toBeCloseTo(97.5);
    expect(m.updateAttempt.mock.calls[0][2]).toMatchObject({
      completedAt: expect.any(Date),
      finishedReason: 'set-passed',
      totalScore: 90,
    });
    expect(m.insertPass).toHaveBeenCalledOnce();
  });

  it('a worse set 2 after a taken-up offer still finishes passed, at set 1’s average', async () => {
    m.row = attemptRow({
      questions: { ...eightStored, improveAccepted: true },
      answers: [...all(1, 4, 50), ...all(5, 7, 10)],
    });
    m.evaluateFreeText.mockResolvedValue(scored(8, 10));
    const r = await answer('q8');
    expect(r).toMatchObject({
      finished: 'set-passed',
      setResult: { set: 2, average: 10, passed: true },
    });
    expect(r.ok && r.setResult?.score.total).toBeCloseTo(87.5);
    expect(m.updateAttempt.mock.calls[0][2].totalScore).toBe(50);
    expect(m.waitUntil).not.toHaveBeenCalled();
  });

  describe('resume (toView)', () => {
    const start = () =>
      startOrResumeAttempt({
        userId: 'u1',
        courseId: 7,
        lessonId: 41,
        lessonSlug: 'l1',
      });

    it('an open attempt whose set 1 passed shows the offer again, set 1 only, and its scored result', async () => {
      m.selectOpenAttempt.mockResolvedValue(
        attemptRow({ questions: eightStored, answers: all(1, 4, 50) }),
      );
      const r = await start();
      expect(m.getScoreFacts).toHaveBeenCalledWith('u1', 'l1', 41);
      expect(m.getCoursePassMark).toHaveBeenCalledWith(7);
      if (!r.ok) throw new Error('expected ok');
      expect(r.attempt.offer).toBe(true);
      expect(r.attempt.questions.map((x) => x.id)).toEqual([
        'q1',
        'q2',
        'q3',
        'q4',
      ]);
      expect(r.attempt.setResults).toMatchObject([
        { set: 1, average: 50, passed: true },
      ]);
      expect(r.attempt.setResults[0]?.score.total).toBeCloseTo(87.5);
    });

    it('after taking the offer up: set 2 is shown, no offer', async () => {
      m.selectOpenAttempt.mockResolvedValue(
        attemptRow({
          questions: { ...eightStored, improveAccepted: true },
          answers: all(1, 4, 50),
        }),
      );
      const r = await start();
      if (!r.ok) throw new Error('expected ok');
      expect(r.attempt.offer).toBe(false);
      expect(r.attempt.questions).toHaveLength(8);
    });

    it('each completed set is scored on the better average so far', async () => {
      m.selectOpenAttempt.mockResolvedValue(
        attemptRow({
          questions: { ...eightStored, improveAccepted: true },
          answers: [...all(1, 4, 50), ...all(5, 8, 10)],
        }),
      );
      const r = await start();
      if (!r.ok) throw new Error('expected ok');
      expect(r.attempt.setResults.map((x) => x.score.total)).toEqual([
        expect.closeTo(87.5),
        expect.closeTo(87.5),
      ]);
    });
  });

  describe('continueAttempt', () => {
    const go = (choice: 'yes' | 'no', over: Record<string, unknown> = {}) =>
      continueAttempt({
        userId: 'u1',
        attemptId: 5,
        choice,
        lessonId: 41,
        courseId: 7,
        ...over,
      });

    beforeEach(() => {
      m.row = attemptRow({ questions: eightStored, answers: all(1, 4, 50) });
    });

    it('yes: records the choice on the locked row and returns set 2’s questions', async () => {
      const r = await go('yes');
      expect(m.lockAttempt).toHaveBeenCalledWith(m.tx, 5);
      expect(m.updateAttempt).toHaveBeenCalledWith(m.tx, 5, {
        questions: { ...eightStored, improveAccepted: true },
      });
      expect(r).toEqual({ ok: true, choice: 'yes', questions: set2 });
      expect(JSON.stringify(r)).not.toContain('SECRET');
      expect(m.getScoreFacts).toHaveBeenCalledWith('u1', 'l1', 41);
      expect(m.getCoursePassMark).toHaveBeenCalledWith(7);
    });

    it('no: finishes the attempt set-passed at the best average', async () => {
      const r = await go('no');
      expect(m.updateAttempt).toHaveBeenCalledWith(m.tx, 5, {
        completedAt: expect.any(Date),
        finishedReason: 'set-passed',
        totalScore: 50,
      });
      expect(r).toMatchObject({ ok: true, choice: 'no' });
      expect(m.waitUntil).not.toHaveBeenCalled();
    });

    it('no: records the pass in the same transaction, and says whether it is new', async () => {
      // The offer is judged on today's facts; set 1 may not have recorded a
      // pass when it completed (a quiz retaken since, a lower pass mark).
      m.insertPass.mockResolvedValue(true);
      expect(await go('no')).toEqual({
        ok: true,
        choice: 'no',
        passedNow: true,
      });
      expect(m.insertPass).toHaveBeenCalledWith(m.tx, {
        userId: 'u1',
        lessonSlug: 'l1',
      });
      m.insertPass.mockResolvedValue(false);
      m.row = attemptRow({ questions: eightStored, answers: all(1, 4, 50) });
      expect(await go('no')).toEqual({
        ok: true,
        choice: 'no',
        passedNow: false,
      });
    });

    it.each([
      ['set 1 not finished', { answers: all(1, 3, 50) }],
      ['set 1 missed', { answers: all(1, 4, 30) }],
      [
        'the offer already taken up',
        { questions: { ...eightStored, improveAccepted: true } },
      ],
      ['a finished attempt', { completedAt: new Date() }],
      ['a one-set attempt', { questions: fourStored }],
    ])('no-offer when %s, writing nothing', async (_why, over) => {
      m.row = attemptRow({
        questions: eightStored,
        answers: all(1, 4, 50),
        ...over,
      });
      expect(await go('yes')).toEqual({ ok: false, reason: 'no-offer' });
      expect(await go('no')).toEqual({ ok: false, reason: 'no-offer' });
      expect(m.updateAttempt).not.toHaveBeenCalled();
    });

    it('judges the offer on the LOCKED row (another tab took it up meanwhile)', async () => {
      m.lockedRow = attemptRow({
        questions: { ...eightStored, improveAccepted: true },
        answers: all(1, 4, 50),
      });
      expect(await go('no')).toEqual({ ok: false, reason: 'no-offer' });
      expect(m.updateAttempt).not.toHaveBeenCalled();
    });

    it.each([
      ['another pilot’s attempt', { userId: 'u2' }],
      ['a legacy attempt', { format: null }],
    ])('forbids %s', async (_why, over) => {
      m.row = attemptRow({
        questions: eightStored,
        answers: all(1, 4, 50),
        ...over,
      });
      expect(await go('yes')).toEqual({ ok: false, reason: 'forbidden' });
      expect(m.updateAttempt).not.toHaveBeenCalled();
    });

    it('forbids an attempt that does not exist', async () => {
      m.row = null;
      expect(await go('no')).toEqual({ ok: false, reason: 'forbidden' });
    });
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
