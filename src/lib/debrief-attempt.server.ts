import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { evaluateFreeText } from '#/ai/evaluate-answer';
import { generateTest } from '#/ai/generate-test';
import {
  type AIEvaluationResult,
  AIEvaluationResultSchema,
} from '#/ai/schemas';
import { db } from '#/db';
import {
  type AttemptRow,
  insertAnswerLog,
  insertAttempt,
  insertPass,
  lockAttempt,
  selectAskedQuestions,
  selectAttempt,
  selectCurrentChunks,
  selectMastery,
  selectOpenAttempt,
  type Tx,
  updateAttempt,
  updateDraft,
  upsertMastery,
} from '#/db/debrief-attempts';
import {
  type AnswerMetrics,
  DEBRIEF_ANSWER_MAX_CHARS,
} from '#/lib/answer-metrics';
import {
  attemptSets,
  DEBRIEF_ATTEMPT_FORMAT,
  type StoredAttempt,
  StoredAttemptSchema,
} from '#/lib/debrief-attempt-snapshot';
import {
  applyChunkScore,
  drawAttemptKeyPoints,
  type KnowledgeChunk,
  masteryOf,
} from '#/lib/debrief-mastery';
import {
  type SetOutcome,
  setsProgress,
  splitIntoSets,
} from '#/lib/debrief-sets';
import {
  ensureLessonChunks,
  mapToCurrentChunkIds,
} from '#/lib/knowledge-chunks.server';
import {
  keyPointFocus,
  prepareDebrief,
  preparedFingerprint,
  takePreparedDebrief,
} from '#/lib/prepared-debrief.server';

/**
 * A question as the pilot sees it: never its expected answer or chunk tags.
 * `set` is 1-based (`#/lib/debrief-sets`).
 */
export type ClientQuestion = { id: string; question: string; set: number };

export type AnsweredQuestion = {
  questionId: string;
  score: number;
  /** Viper's feedback on the answer; '' on answers graded before it existed. */
  feedback: string;
  revisitNote: string;
};

/** Everything the debrief tab needs to show (or resume) an attempt. */
export type AttemptView = {
  attemptId: number;
  /**
   * Only the sets the pilot has reached: set 2 stays on the server until set
   * 1 is answered and missed, so it can never be read ahead of time.
   */
  questions: ClientQuestion[];
  answered: AnsweredQuestion[];
  draft: { questionId: string; text: string } | null;
};

export type StartResult =
  | { ok: true; attempt: AttemptView }
  /** No chunks could be built: nothing to debrief from. */
  | { ok: false; reason: 'no-source' }
  /** Another request is still generating the lesson's first chunks: retry. */
  | { ok: false; reason: 'busy' };

export type AnswerResult =
  | {
      ok: true;
      evaluation: { score: number; feedback: string; revisitNote: string };
      /** Set when this answer completed its set. */
      setResult: SetOutcome | null;
      /** The next set's questions, when this answer missed a set and opened it. */
      nextQuestions: ClientQuestion[];
      /**
       * `set-passed`: a set averaged 75 or more — a permanent pass.
       * `sets-missed`: the last set is done without one.
       */
      finished: null | 'set-passed' | 'sets-missed';
    }
  /** Not this pilot's, not a chunk-format attempt, or finished. */
  | { ok: false; reason: 'forbidden' }
  /** Not the first unanswered question of the attempt. */
  | { ok: false; reason: 'out-of-order' };

const storedAnswersSchema = z.array(AIEvaluationResultSchema);

function parseStored(row: AttemptRow): StoredAttempt {
  const parsed = StoredAttemptSchema.safeParse(row.questions);
  if (!parsed.success) {
    throw new Error(`Debrief attempt ${row.id} has an unreadable snapshot`);
  }
  return parsed.data;
}

function parseAnswers(row: AttemptRow): AIEvaluationResult[] {
  const parsed = storedAnswersSchema.safeParse(row.answers);
  if (!parsed.success) {
    throw new Error(`Debrief attempt ${row.id} has unreadable answers`);
  }
  return parsed.data;
}

const toAnswered = (e: AIEvaluationResult): AnsweredQuestion => ({
  questionId: e.questionId,
  score: e.score,
  feedback: e.feedback ?? '',
  revisitNote: e.revisitNote ?? '',
});

const scoresOf = (answers: readonly AIEvaluationResult[]) =>
  new Map(answers.map((e) => [e.questionId, e.score]));

/** The questions of sets `from`..`to` (1-based, inclusive), as the client sees them. */
function clientQuestions(
  stored: StoredAttempt,
  from: number,
  to: number,
): ClientQuestion[] {
  const byId = new Map(stored.questions.map((q) => [q.id, q]));
  return attemptSets(stored)
    .slice(from - 1, to)
    .flatMap((ids, i) =>
      ids.flatMap((id) => {
        const q = byId.get(id);
        // Picked field by field: the stored question carries
        // `expectedAnswer` and `chunkIds`, which must never reach the client.
        return q ? [{ id: q.id, question: q.question, set: from + i }] : [];
      }),
    );
}

/**
 * The lesson's current chunk list, for counting mastery. Falls back to the
 * attempt's own snapshot when the lesson no longer has stored chunks, so an
 * open attempt still shows a sensible count. Inside a transaction (`ex`) the
 * row is read `for share` (see `selectCurrentChunks`).
 */
async function currentChunksOr(
  lessonId: number,
  fallback: KnowledgeChunk[],
  ex?: Tx,
) {
  const row = ex
    ? await selectCurrentChunks(lessonId, ex, { forShare: true })
    : await selectCurrentChunks(lessonId);
  return {
    chunks: row?.chunks ?? fallback,
    version: row?.version ?? null,
    previousMapping: row?.previousMapping ?? null,
  };
}

function toView(row: AttemptRow): AttemptView {
  const stored = parseStored(row);
  const answers = parseAnswers(row);
  const { reached } = setsProgress(attemptSets(stored), scoresOf(answers));
  return {
    attemptId: row.id,
    questions: clientQuestions(stored, 1, reached),
    answered: answers.map(toAnswered),
    draft: row.draft ?? null,
  };
}

/**
 * The pilot's debrief attempt on this lesson: the open one if there is one
 * (resume — same questions, answers so far and draft), else a new one.
 *
 * A new attempt asks up to eight of the lesson's key points, a fresh random
 * draw with the pilot's misses first (`drawAttemptKeyPoints`), in sets of
 * four. It is served from the prepared test when that was drawn for exactly
 * this chunk version and mastery, else generated now. It stores a snapshot of
 * the questions, their sets, the chunks and the context, which is all
 * grading ever reads.
 *
 * The caller has already checked the debrief is open (`getDebriefAccess`).
 */
export async function startOrResumeAttempt(k: {
  userId: string;
  courseId: number;
  lessonId: number;
  lessonSlug: string;
}): Promise<StartResult> {
  const open = await selectOpenAttempt(k.userId, k.lessonSlug);
  if (open) {
    return { ok: true, attempt: toView(open) };
  }

  const lesson = await ensureLessonChunks(k.lessonId, k.lessonSlug, k.courseId);
  if (lesson.kind !== 'ready') return { ok: false, reason: lesson.kind };

  const mastery = masteryOf(
    lesson.chunks,
    await selectMastery(k.userId, k.lessonId),
  );
  const key = {
    userId: k.userId,
    courseId: k.courseId,
    lessonSlug: k.lessonSlug,
  };
  const test =
    (await takePreparedDebrief(
      key,
      preparedFingerprint(lesson.version, mastery),
    )) ??
    (await generateTest({
      lessonSlug: k.lessonSlug,
      chunks: lesson.chunks,
      context: lesson.context,
      focus: keyPointFocus(drawAttemptKeyPoints(lesson.chunks, mastery)),
      avoidQuestions: await selectAskedQuestions(k.userId, k.lessonSlug),
    }));
  if (test.questions.length === 0) {
    throw new Error(`No debrief questions generated for ${k.lessonSlug}`);
  }

  const inserted = await insertAttempt({
    userId: k.userId,
    lessonSlug: k.lessonSlug,
    stored: {
      lessonSlug: k.lessonSlug,
      questions: test.questions,
      chunks: lesson.chunks,
      context: lesson.context,
      sets: splitIntoSets(test.questions.map((q) => q.id)),
    },
    chunkVersion: lesson.version,
  });
  // Null: a concurrent start (another tab) inserted first — resume theirs.
  const row = inserted ?? (await selectOpenAttempt(k.userId, k.lessonSlug));
  if (!row) throw new Error('Debrief attempt vanished after a start conflict');
  return { ok: true, attempt: toView(row) };
}

/** Owner and lesson of an attempt, for the routes' gate. */
export async function getAttemptOwner(
  attemptId: number,
): Promise<{ userId: string; lessonSlug: string } | null> {
  const row = await selectAttempt(attemptId);
  return row ? { userId: row.userId, lessonSlug: row.lessonSlug } : null;
}

/** The transaction's outcome: a result, or "another request answered first". */
type TxOutcome =
  | AnswerResult
  | { lost: true; row: AttemptRow; winner: AIEvaluationResult };

const isChunkAttempt = (row: AttemptRow | null, userId: string) =>
  row !== null &&
  row.userId === userId &&
  row.format === DEBRIEF_ATTEMPT_FORMAT;

/**
 * Grade one answer on the server and record it.
 *
 * Idempotent per (attempt, question): an answer already recorded — a double
 * submit, or a second tab — returns the stored evaluation and changes
 * nothing. Grading runs outside the transaction (it is a model call); the
 * write locks the attempt row and re-checks, so of two concurrent graders
 * only the first commits and the second returns the first's evaluation.
 *
 * Questions are answered in order, and only within the sets reached (set 2
 * opens when set 1 is missed). Each chunk score is applied to the pilot's
 * mastery of the lesson's CURRENT chunk list (mapped across one
 * regeneration), which only orders the next draw. When the answer completes
 * a set (`setsProgress`):
 * - average 75 or more: `set-passed` — a permanent pass, score = that
 *   average, any later set never asked;
 * - below 75 with a set left: the attempt goes on, and the next set's
 *   questions come back in `nextQuestions`;
 * - below 75 on the last set: `sets-missed`, score = that average, and the
 *   next attempt is prepared in the background.
 */
export async function answerQuestion(a: {
  userId: string;
  attemptId: number;
  questionId: string;
  answer: string;
  metrics: AnswerMetrics;
  lessonId: number;
  courseId: number;
}): Promise<AnswerResult> {
  const row = await selectAttempt(a.attemptId);
  if (!row || !isChunkAttempt(row, a.userId)) {
    return { ok: false, reason: 'forbidden' };
  }
  const stored = parseStored(row);
  const answers = parseAnswers(row);

  const already = answers.find((e) => e.questionId === a.questionId);
  if (already) return storedResult(row, already);
  if (row.completedAt !== null) return { ok: false, reason: 'forbidden' };

  const answeredIds = new Set(answers.map((e) => e.questionId));
  const next = stored.questions.find((q) => !answeredIds.has(q.id));
  if (!next || next.id !== a.questionId) {
    return { ok: false, reason: 'out-of-order' };
  }

  // The snapshot, never the lesson's current source (Review Focus 2).
  const evaluation = await evaluateFreeText(
    next,
    a.answer,
    stored.chunks,
    stored.context,
  );

  const outcome = await db.transaction(async (tx): Promise<TxOutcome> => {
    const locked = await lockAttempt(tx, a.attemptId);
    if (!locked || !isChunkAttempt(locked, a.userId)) {
      return { ok: false, reason: 'forbidden' };
    }
    const lockedAnswers = parseAnswers(locked);
    const winner = lockedAnswers.find((e) => e.questionId === a.questionId);
    // Another request recorded this answer while we graded: theirs stands.
    if (winner) return { lost: true, row: locked, winner };
    if (locked.completedAt !== null) {
      return { ok: false, reason: 'forbidden' };
    }

    const current = await currentChunksOr(a.lessonId, stored.chunks, tx);
    const rows = await selectMastery(a.userId, a.lessonId, tx);
    const scores =
      current.version === null
        ? {}
        : mapToCurrentChunkIds(
            evaluation.chunkScores ?? {},
            current.previousMapping,
            current.version,
          );

    const now = new Date();
    const byId = new Map(rows.map((r) => [r.chunkId, r]));
    const writes = Object.entries(scores).map(([chunkId, score]) => {
      const prev = byId.get(chunkId);
      const applied = applyChunkScore(
        prev && {
          chunkId,
          latestScore: prev.latestScore,
          cleared: prev.clearedAt !== null,
        },
        chunkId,
        score,
      );
      return {
        userId: a.userId,
        lessonId: a.lessonId,
        chunkId,
        latestScore: score,
        clearedAt: applied.cleared ? (prev?.clearedAt ?? now) : null,
      };
    });
    if (writes.length > 0) await upsertMastery(tx, writes);

    const newAnswers = [...lockedAnswers, evaluation];
    const step = setStep(stored, lockedAnswers, newAnswers, a.questionId);

    await updateAttempt(tx, a.attemptId, {
      answers: newAnswers,
      draft: null,
      ...(step.finished && {
        completedAt: now,
        totalScore: step.setResult?.average ?? 0,
        finishedReason: step.finished,
      }),
    });
    await insertAnswerLog(tx, {
      attemptId: a.attemptId,
      questionId: a.questionId,
      metrics: a.metrics,
    });
    if (step.finished === 'set-passed') {
      await insertPass(tx, { userId: a.userId, lessonSlug: row.lessonSlug });
    }
    return {
      ok: true,
      evaluation: evaluationView(evaluation),
      ...step,
    };
  });

  if ('lost' in outcome) {
    return storedResult(outcome.row, outcome.winner);
  }
  if (outcome.ok && outcome.finished === 'sets-missed') {
    // No pass: the retake opens later with a fresh draw, misses first.
    // Not awaited — the pilot is waiting on this response, not the model.
    waitUntil(
      prepareDebrief({
        userId: a.userId,
        courseId: a.courseId,
        lessonSlug: row.lessonSlug,
        lessonId: a.lessonId,
      }).catch((error: unknown) => {
        console.error('Failed to prepare debrief retake:', error);
      }),
    );
  }
  return outcome;
}

const evaluationView = (e: AIEvaluationResult) => ({
  score: e.score,
  feedback: e.feedback ?? '',
  revisitNote: e.revisitNote ?? '',
});

/**
 * What answering `questionId` did to the attempt's sets: the set it
 * completed (if any), the set it opened, and whether the attempt is over.
 * `before` / `after` are the recorded answers without and with it.
 */
function setStep(
  stored: StoredAttempt,
  before: readonly AIEvaluationResult[],
  after: readonly AIEvaluationResult[],
  questionId: string,
): Pick<
  Extract<AnswerResult, { ok: true }>,
  'setResult' | 'nextQuestions' | 'finished'
> {
  const sets = attemptSets(stored);
  const was = setsProgress(sets, scoresOf(before));
  const now = setsProgress(sets, scoresOf(after));
  const completedHere = now.completed.length > was.completed.length;
  const setResult = completedHere ? (now.completed.at(-1) ?? null) : null;
  // Only the answer that completed a set can report what it did; any other
  // answer (or a replay of one) changes nothing about the sets.
  const isCompleting =
    setResult !== null && sets[setResult.set - 1]?.includes(questionId);
  if (!isCompleting) {
    return { setResult: null, nextQuestions: [], finished: null };
  }
  return {
    setResult,
    nextQuestions:
      now.reached > was.reached
        ? clientQuestions(stored, now.reached, now.reached)
        : [],
    finished: now.passed ? 'set-passed' : now.over ? 'sets-missed' : null,
  };
}

/** The result of an answer recorded earlier, as it reads now. */
async function storedResult(
  row: AttemptRow,
  evaluation: AIEvaluationResult,
): Promise<AnswerResult> {
  const stored = parseStored(row);
  const answers = parseAnswers(row);
  const at = answers.findIndex((e) => e.questionId === evaluation.questionId);
  return {
    ok: true,
    evaluation: evaluationView(evaluation),
    ...setStep(
      stored,
      answers.slice(0, at),
      answers.slice(0, at + 1),
      evaluation.questionId,
    ),
  };
}

export type DraftOutcome = 'saved' | 'forbidden' | 'wrong-question';

/**
 * Save the answer being typed, so a closed tab loses nothing. Only on the
 * pilot's own unfinished attempt (`forbidden` otherwise), and only for its
 * current question — the first unanswered one (`wrong-question` otherwise),
 * since that is the only draft a resume restores. The write itself is
 * guarded again, so an attempt finished in between is still `forbidden`.
 */
export async function saveDraft(d: {
  userId: string;
  attemptId: number;
  questionId: string;
  text: string;
}): Promise<DraftOutcome> {
  const row = await selectAttempt(d.attemptId);
  if (!row || !isChunkAttempt(row, d.userId) || row.completedAt !== null) {
    return 'forbidden';
  }
  const answered = new Set(parseAnswers(row).map((e) => e.questionId));
  const current = parseStored(row).questions.find((q) => !answered.has(q.id));
  if (current?.id !== d.questionId) return 'wrong-question';

  const saved = await updateDraft(d.userId, d.attemptId, {
    questionId: d.questionId,
    text: d.text.slice(0, DEBRIEF_ANSWER_MAX_CHARS),
  });
  return saved ? 'saved' : 'forbidden';
}
