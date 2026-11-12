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
  DEBRIEF_ATTEMPT_FORMAT,
  type StoredAttempt,
  StoredAttemptSchema,
} from '#/lib/debrief-attempt-snapshot';
import {
  applyChunkScore,
  isAllCleared,
  type KnowledgeChunk,
  masteryCounts,
  masteryOf,
  masteryPercent,
  planAttemptFocus,
} from '#/lib/debrief-mastery';
import {
  ensureLessonChunks,
  mapToCurrentChunkIds,
} from '#/lib/knowledge-chunks.server';
import {
  prepareDebrief,
  preparedFingerprint,
  takePreparedDebrief,
} from '#/lib/prepared-debrief.server';

/** A question as the pilot sees it. Never its expected answer or chunk tags. */
export type ClientQuestion = { id: string; question: string };

export type AnsweredQuestion = {
  questionId: string;
  score: number;
  revisitNote: string;
};

/** Everything the debrief tab needs to show (or resume) an attempt. */
export type AttemptView = {
  attemptId: number;
  questions: ClientQuestion[];
  answered: AnsweredQuestion[];
  draft: { questionId: string; text: string } | null;
  mastery: { cleared: number; total: number };
};

export type StartResult =
  | { ok: true; attempt: AttemptView }
  /** No chunks could be built: nothing to debrief from. */
  | { ok: false; reason: 'no-source' }
  /** Every current chunk was already cleared: the pass is now recorded. */
  | { ok: false; reason: 'passed' };

export type AnswerResult =
  | {
      ok: true;
      evaluation: { score: number; revisitNote: string };
      mastery: { cleared: number; total: number; percent: number };
      finished: null | 'all-answered' | 'all-cleared';
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
  revisitNote: e.revisitNote ?? '',
});

/**
 * The lesson's current chunk list, for counting mastery. Falls back to the
 * attempt's own snapshot when the lesson no longer has stored chunks, so an
 * open attempt still shows a sensible count.
 */
async function currentChunksOr(
  lessonId: number,
  fallback: KnowledgeChunk[],
  ex?: Tx,
) {
  const row = await selectCurrentChunks(lessonId, ex);
  return {
    chunks: row?.chunks ?? fallback,
    version: row?.version ?? null,
    previousMapping: row?.previousMapping ?? null,
  };
}

async function toView(
  row: AttemptRow,
  userId: string,
  lessonId: number,
): Promise<AttemptView> {
  const stored = parseStored(row);
  const [current, rows] = await Promise.all([
    currentChunksOr(lessonId, stored.chunks),
    selectMastery(userId, lessonId),
  ]);
  return {
    attemptId: row.id,
    // Picked field by field: the stored question carries `expectedAnswer`
    // and `chunkIds`, which must never reach the client.
    questions: stored.questions.map((q) => ({
      id: q.id,
      question: q.question,
    })),
    answered: parseAnswers(row).map(toAnswered),
    draft: row.draft ?? null,
    mastery: masteryCounts(current.chunks, rows),
  };
}

/**
 * The pilot's debrief attempt on this lesson: the open one if there is one
 * (resume — same questions, answers so far and draft), else a new one.
 *
 * A new attempt asks about the pilot's holes plus a little review
 * (`planAttemptFocus` over current mastery), served from the prepared test
 * when it was built for exactly this chunk version and focus, else generated
 * now. It stores a snapshot of the questions, chunks and context, which is
 * all grading ever reads.
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
    return { ok: true, attempt: await toView(open, k.userId, k.lessonId) };
  }

  const lesson = await ensureLessonChunks(k.lessonId, k.lessonSlug, k.courseId);
  if (!lesson) return { ok: false, reason: 'no-source' };

  const mastery = masteryOf(
    lesson.chunks,
    await selectMastery(k.userId, k.lessonId),
  );
  if (isAllCleared(lesson.chunks, mastery)) {
    // Reachable only when a regeneration carried every hole over as cleared.
    await db.transaction(async (tx) =>
      insertPass(tx, { userId: k.userId, lessonSlug: k.lessonSlug }),
    );
    return { ok: false, reason: 'passed' };
  }

  const focus = planAttemptFocus(lesson.chunks, mastery);
  const key = {
    userId: k.userId,
    courseId: k.courseId,
    lessonSlug: k.lessonSlug,
  };
  const test =
    (await takePreparedDebrief(
      key,
      preparedFingerprint(lesson.version, focus),
    )) ??
    (await generateTest({
      lessonSlug: k.lessonSlug,
      chunks: lesson.chunks,
      context: lesson.context,
      focus,
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
    },
    chunkVersion: lesson.version,
  });
  // Null: a concurrent start (another tab) inserted first — resume theirs.
  const row = inserted ?? (await selectOpenAttempt(k.userId, k.lessonSlug));
  if (!row) throw new Error('Debrief attempt vanished after a start conflict');
  return { ok: true, attempt: await toView(row, k.userId, k.lessonId) };
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
 * Questions are answered in order. Each chunk score is applied to the
 * pilot's mastery of the lesson's CURRENT chunk list (mapped across one
 * regeneration; an id that maps to nothing updates no mastery but stays on
 * the attempt). The attempt finishes:
 * - `all-cleared` the moment every current chunk is cleared — score 100 and
 *   a permanent pass, remaining questions skipped;
 * - `all-answered` when the last question is answered with holes left —
 *   score = mastery percent, and the next attempt is prepared in the
 *   background.
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
  if (already) return storedResult(row, already, a.userId, a.lessonId);
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

    // Mastery after this answer, against the current list.
    const after = new Map(
      [...rows, ...writes].map((r) => [
        r.chunkId,
        {
          chunkId: r.chunkId,
          latestScore: r.latestScore,
          clearedAt: r.clearedAt,
        },
      ]),
    );
    const afterRows = [...after.values()];
    const allCleared = isAllCleared(
      current.chunks,
      masteryOf(current.chunks, afterRows),
    );
    const newAnswers = [...lockedAnswers, evaluation];
    const answered = new Set(newAnswers.map((e) => e.questionId));
    const allAnswered = stored.questions.every((q) => answered.has(q.id));
    const finished = allCleared
      ? ('all-cleared' as const)
      : allAnswered
        ? ('all-answered' as const)
        : null;
    const counts = masteryCounts(current.chunks, afterRows);
    const percent = masteryPercent({
      ...counts,
      passed: finished === 'all-cleared',
    });

    await updateAttempt(tx, a.attemptId, {
      answers: newAnswers,
      draft: null,
      ...(finished && {
        completedAt: now,
        totalScore: finished === 'all-cleared' ? 100 : percent,
        finishedReason: finished,
      }),
    });
    await insertAnswerLog(tx, {
      attemptId: a.attemptId,
      questionId: a.questionId,
      metrics: a.metrics,
    });
    if (finished === 'all-cleared') {
      await insertPass(tx, { userId: a.userId, lessonSlug: row.lessonSlug });
    }
    return {
      ok: true,
      evaluation: {
        score: evaluation.score,
        revisitNote: evaluation.revisitNote ?? '',
      },
      mastery: { ...counts, percent },
      finished,
    };
  });

  if ('lost' in outcome) {
    return storedResult(outcome.row, outcome.winner, a.userId, a.lessonId);
  }
  if (outcome.ok && outcome.finished === 'all-answered') {
    // Holes left: the retake opens in 6h with a fresh, holes-focused set.
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

/** The result of an answer recorded earlier, as it reads now. */
async function storedResult(
  row: AttemptRow,
  evaluation: AIEvaluationResult,
  userId: string,
  lessonId: number,
): Promise<AnswerResult> {
  const stored = parseStored(row);
  const [current, rows] = await Promise.all([
    currentChunksOr(lessonId, stored.chunks),
    selectMastery(userId, lessonId),
  ]);
  const counts = masteryCounts(current.chunks, rows);
  const finished = row.finishedReason ?? null;
  return {
    ok: true,
    evaluation: {
      score: evaluation.score,
      revisitNote: evaluation.revisitNote ?? '',
    },
    mastery: {
      ...counts,
      percent: masteryPercent({
        ...counts,
        passed: finished === 'all-cleared',
      }),
    },
    finished,
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
