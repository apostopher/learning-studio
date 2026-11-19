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
  selectChunkAttempts,
  selectCurrentChunks,
  selectHasPass,
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
  completedSetAverages,
  type SetJudge,
  type SetOutcome,
  type SetsProgress,
  setsProgress,
  splitIntoSets,
} from '#/lib/debrief-sets';
import {
  ensureLessonChunks,
  mapToCurrentChunkIds,
} from '#/lib/knowledge-chunks.server';
import {
  debriefJudge,
  type LessonScore,
  type ScoreFacts,
  setScore,
} from '#/lib/lesson-score';
import { getCoursePassMark, getScoreFacts } from '#/lib/lesson-score.server';
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

/**
 * A completed set as the pilot sees it: `score` is the lesson total with the
 * BETTER set average so far as its debrief part, the score it was judged on.
 */
export type ScoredSet = SetOutcome & { score: LessonScore };

/** Everything the debrief tab needs to show (or resume) an attempt. */
export type AttemptView = {
  attemptId: number;
  /**
   * Only the sets the pilot has reached: set 2 stays on the server until set
   * 1 is missed or the pilot takes up the offer to improve on a pass, so it
   * can never be read ahead of time.
   */
  questions: ClientQuestion[];
  answered: AnsweredQuestion[];
  draft: { questionId: string; text: string } | null;
  /** Set 1 passed and set 2 waits on the pilot's choice (`continueAttempt`). */
  offer: boolean;
  /** One per completed set, in order. */
  setResults: ScoredSet[];
};

export type ContinueResult =
  | { ok: true; choice: 'yes'; questions: ClientQuestion[] }
  /** `passedNow`: finishing recorded a pass that was not yet held. */
  | { ok: true; choice: 'no'; passedNow: boolean }
  /** Not this pilot's attempt, or not a chunk-format one. */
  | { ok: false; reason: 'forbidden' }
  /** Finished, or no set-2 offer is open on it. */
  | { ok: false; reason: 'no-offer' };

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
      setResult: ScoredSet | null;
      /** The next set's questions, when this answer missed a set and opened it. */
      nextQuestions: ClientQuestion[];
      /** This answer passed set 1 and set 2 may be offered (`continueAttempt`). */
      offer: boolean;
      /** This answer recorded the pass. Never on a replay. */
      passedNow: boolean;
      /**
       * Set only when nothing is left to ask:
       * `set-passed`: some set passed — the pass was recorded when it did.
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

/** How a lesson's sets are judged for this pilot: the facts, the course's pass mark, the judge. */
type Scoring = { facts: ScoreFacts; passMark: number; judge: SetJudge };

/**
 * The judge always counts the debrief part, even on a lesson whose debrief
 * switch is off: it judges a debrief being taken.
 */
async function loadScoring(k: {
  userId: string;
  lessonSlug: string;
  lessonId: number;
  courseId: number;
}): Promise<Scoring> {
  const [facts, passMark] = await Promise.all([
    getScoreFacts(k.userId, k.lessonSlug, k.lessonId),
    getCoursePassMark(k.courseId),
  ]);
  return { facts, passMark, judge: debriefJudge(facts, passMark) };
}

function progressOf(
  stored: StoredAttempt,
  answers: readonly AIEvaluationResult[],
  judge: SetJudge,
  improveAccepted = stored.improveAccepted ?? false,
): SetsProgress {
  return setsProgress(attemptSets(stored), scoresOf(answers), judge, {
    improveAccepted,
  });
}

/** Each completed set with the lesson total on the better average so far. */
function scoredSets(completed: readonly SetOutcome[], s: Scoring): ScoredSet[] {
  let best = Number.NEGATIVE_INFINITY;
  return completed.map((c) => {
    best = Math.max(best, c.average);
    return { ...c, score: setScore(s.facts, s.passMark, best) };
  });
}

/**
 * The question the pilot may answer next: the first unanswered one, if it is
 * in a set reached. Null when there is none (all answered, or set 2 waits on
 * the offer).
 */
function nextAnswerable(
  stored: StoredAttempt,
  answers: readonly AIEvaluationResult[],
  judge: SetJudge,
) {
  const { reached } = progressOf(stored, answers, judge);
  const reachable = new Set(attemptSets(stored).slice(0, reached).flat());
  const answeredIds = new Set(answers.map((e) => e.questionId));
  const next = stored.questions.find((q) => !answeredIds.has(q.id));
  return next && reachable.has(next.id) ? next : null;
}

function toView(row: AttemptRow, scoring: Scoring): AttemptView {
  const stored = parseStored(row);
  const answers = parseAnswers(row);
  const p = progressOf(stored, answers, scoring.judge);
  return {
    attemptId: row.id,
    questions: clientQuestions(stored, 1, p.reached),
    answered: answers.map(toAnswered),
    draft: row.draft ?? null,
    offer: p.offer,
    setResults: scoredSets(p.completed, scoring),
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
    return { ok: true, attempt: toView(open, await loadScoring(k)) };
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
  return { ok: true, attempt: toView(row, await loadScoring(k)) };
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
 * Questions are answered in order, and only within the sets reached. Each
 * chunk score is applied to the pilot's mastery of the lesson's CURRENT chunk
 * list (mapped across one regeneration), which only orders the next draw.
 *
 * A completed set is judged on the LESSON TOTAL (`setScore`): the pilot's
 * video and quiz parts (`getScoreFacts`) plus the better set average so far
 * as the debrief part, against the course's pass mark (`getCoursePassMark`).
 * When the answer completes a set:
 * - set 1 passes and there is a set 2: the pass is recorded now
 *   (`passedNow`) and the attempt stays open with `offer` — the pilot either
 *   takes set 2 to improve or stops (`continueAttempt`);
 * - set 1 passes and it is the only set: the pass is recorded and the
 *   attempt finishes `set-passed`;
 * - set 1 misses: set 2's questions come back in `nextQuestions`;
 * - set 2 is done: the attempt finishes, `set-passed` if the better average
 *   passes (a pass recorded here is `passedNow` only if set 1 had not
 *   already passed), else `sets-missed`, and the next attempt is prepared in
 *   the background. A pass is final: when the pilot took up the offer after
 *   a passed set 1, or already holds the lesson's pass, the attempt finishes
 *   `set-passed` (at the best average) even if today's facts no longer pass.
 * A finished attempt's `totalScore` is the better set average.
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
  const scoring = await loadScoring({
    userId: a.userId,
    lessonSlug: row.lessonSlug,
    lessonId: a.lessonId,
    courseId: a.courseId,
  });

  const already = answers.find((e) => e.questionId === a.questionId);
  if (already) return storedResult(row, already, scoring);
  if (row.completedAt !== null) return { ok: false, reason: 'forbidden' };

  const next = nextAnswerable(stored, answers, scoring.judge);
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
    // The snapshot as it is now: another tab may have taken up the offer.
    const lockedStored = parseStored(locked);
    if (
      nextAnswerable(lockedStored, lockedAnswers, scoring.judge)?.id !==
      a.questionId
    ) {
      return { ok: false, reason: 'out-of-order' };
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
    const step = setStep(
      lockedStored,
      lockedAnswers,
      newAnswers,
      a.questionId,
      scoring,
    );
    // A pass is final. Facts can drop after one was recorded (a worse quiz
    // retake), so a set 2 taken up after a passed set 1 — or any attempt on a
    // lesson already passed — never ends as two misses or prepares a retake.
    if (
      step.result.finished === 'sets-missed' &&
      (lockedStored.improveAccepted === true ||
        (await selectHasPass(tx, {
          userId: a.userId,
          lessonSlug: row.lessonSlug,
        })))
    ) {
      step.result.finished = 'set-passed';
    }

    await updateAttempt(tx, a.attemptId, {
      answers: newAnswers,
      draft: null,
      ...(step.result.finished && {
        completedAt: now,
        totalScore: step.best ?? 0,
        finishedReason: step.result.finished,
      }),
    });
    await insertAnswerLog(tx, {
      attemptId: a.attemptId,
      questionId: a.questionId,
      metrics: a.metrics,
    });
    // Every passing set records it; a second insert is a no-op.
    if (step.result.setResult?.passed) {
      await insertPass(tx, { userId: a.userId, lessonSlug: row.lessonSlug });
    }
    return {
      ok: true,
      evaluation: evaluationView(evaluation),
      ...step.result,
      passedNow: step.newlyPassed,
    };
  });

  if ('lost' in outcome) {
    return storedResult(outcome.row, outcome.winner, scoring);
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

type StepResult = Pick<
  Extract<AnswerResult, { ok: true }>,
  'setResult' | 'nextQuestions' | 'offer' | 'finished'
>;

/**
 * What answering `questionId` did to the attempt's sets: the set it
 * completed (if any), the set it opened, the offer, and whether the attempt
 * is over. `before` / `after` are the recorded answers without and with it.
 *
 * The offer's choice only ever applies to set 2's answers: an answer in set
 * 1 is judged as it was when recorded (no choice made yet), so a replay of
 * the answer that passed set 1 reports the offer even after it was taken up.
 */
function setStep(
  stored: StoredAttempt,
  before: readonly AIEvaluationResult[],
  after: readonly AIEvaluationResult[],
  questionId: string,
  scoring: Scoring,
): { result: StepResult; newlyPassed: boolean; best: number | null } {
  const sets = attemptSets(stored);
  const setOf = sets.findIndex((ids) => ids.includes(questionId)) + 1;
  const accepted = setOf > 1 && (stored.improveAccepted ?? false);
  const was = progressOf(stored, before, scoring.judge, accepted);
  const now = progressOf(stored, after, scoring.judge, accepted);
  const completedHere = now.completed.length > was.completed.length;
  const setResult = completedHere
    ? (scoredSets(now.completed, scoring).at(-1) ?? null)
    : null;
  // Only the answer that completed a set can report what it did; any other
  // answer (or a replay of one) changes nothing about the sets.
  const isCompleting = setResult !== null && setResult.set === setOf;
  if (!isCompleting) {
    return {
      result: {
        setResult: null,
        nextQuestions: [],
        offer: false,
        finished: null,
      },
      newlyPassed: false,
      best: now.best,
    };
  }
  return {
    result: {
      setResult,
      nextQuestions:
        now.reached > was.reached
          ? clientQuestions(stored, now.reached, now.reached)
          : [],
      offer: now.offer,
      finished: now.over ? (now.passed ? 'set-passed' : 'sets-missed') : null,
    },
    newlyPassed: now.passed && !was.passed,
    best: now.best,
  };
}

/** The result of an answer recorded earlier, as it read then. Never `passedNow`. */
function storedResult(
  row: AttemptRow,
  evaluation: AIEvaluationResult,
  scoring: Scoring,
): AnswerResult {
  const stored = parseStored(row);
  const answers = parseAnswers(row);
  const at = answers.findIndex((e) => e.questionId === evaluation.questionId);
  const step = setStep(
    stored,
    answers.slice(0, at),
    answers.slice(0, at + 1),
    evaluation.questionId,
    scoring,
  );
  return {
    ok: true,
    evaluation: evaluationView(evaluation),
    ...step.result,
    // The row's recorded finish wins: a held pass can turn a recomputed
    // `sets-missed` into `set-passed` (see `answerQuestion`).
    finished:
      step.result.finished &&
      (row.finishedReason === 'set-passed' ||
        row.finishedReason === 'sets-missed')
        ? row.finishedReason
        : step.result.finished,
    passedNow: false,
  };
}

/**
 * The pilot's answer to the offer of set 2 after passing set 1. The pass is
 * already recorded; this only decides whether the attempt goes on.
 * - `yes`: the choice is stored on the snapshot (`improveAccepted`) and set
 *   2's questions come back. The finished attempt is then judged on the
 *   better of the two averages, so set 2 can only raise its score.
 * - `no`: the attempt finishes `set-passed` at set 1's average, and the pass
 *   is recorded (idempotent; `passedNow` when it was not yet held).
 *
 * Decided on the LOCKED row: `no-offer` when it is finished or has no open
 * offer (already taken up, set 1 missed or unfinished, or one set only).
 */
export async function continueAttempt(a: {
  userId: string;
  attemptId: number;
  choice: 'yes' | 'no';
  lessonId: number;
  courseId: number;
}): Promise<ContinueResult> {
  const row = await selectAttempt(a.attemptId);
  if (!row || !isChunkAttempt(row, a.userId)) {
    return { ok: false, reason: 'forbidden' };
  }
  const scoring = await loadScoring({
    userId: a.userId,
    lessonSlug: row.lessonSlug,
    lessonId: a.lessonId,
    courseId: a.courseId,
  });

  return db.transaction(async (tx): Promise<ContinueResult> => {
    const locked = await lockAttempt(tx, a.attemptId);
    if (!locked || !isChunkAttempt(locked, a.userId)) {
      return { ok: false, reason: 'forbidden' };
    }
    if (locked.completedAt !== null) return { ok: false, reason: 'no-offer' };
    const stored = parseStored(locked);
    const p = progressOf(stored, parseAnswers(locked), scoring.judge);
    if (!p.offer) return { ok: false, reason: 'no-offer' };

    if (a.choice === 'yes') {
      const accepted: StoredAttempt = { ...stored, improveAccepted: true };
      await updateAttempt(tx, a.attemptId, { questions: accepted });
      return {
        ok: true,
        choice: 'yes',
        questions: clientQuestions(accepted, 2, 2),
      };
    }
    await updateAttempt(tx, a.attemptId, {
      completedAt: new Date(),
      finishedReason: 'set-passed',
      totalScore: p.best ?? 0,
    });
    // The offer is judged on today's facts and this course's pass mark, so
    // set 1 may not have recorded a pass when it completed (a quiz retaken
    // since, or a course with a lower pass mark). A `set-passed` row always
    // has its `debrief_passes` row.
    const passedNow = await insertPass(tx, {
      userId: a.userId,
      lessonSlug: locked.lessonSlug,
    });
    return { ok: true, choice: 'no', passedNow };
  });
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

/**
 * After a quiz save: record the pass if the best completed set so far, plus
 * the current video and quiz, reaches the course pass mark. True when it
 * recorded one. Sets of every chunk-format attempt count, finished or open;
 * rows that no longer parse are skipped. No completed set means no pass.
 */
export async function recheckDebriefPass(a: {
  userId: string;
  lessonSlug: string;
  lessonId: number;
  courseId: number;
}): Promise<boolean> {
  if (await selectHasPass(db, a)) return false;

  const averages = (await selectChunkAttempts(a.userId, a.lessonSlug)).flatMap(
    (row) => {
      try {
        return completedSetAverages(
          attemptSets(parseStored(row)),
          scoresOf(parseAnswers(row)),
        );
      } catch {
        return [];
      }
    },
  );
  if (averages.length === 0) return false;
  const best = Math.max(...averages);

  const [facts, passMark] = await Promise.all([
    getScoreFacts(a.userId, a.lessonSlug, a.lessonId),
    getCoursePassMark(a.courseId),
  ]);
  if (!debriefJudge(facts, passMark)(best)) return false;
  return insertPass(db, { userId: a.userId, lessonSlug: a.lessonSlug });
}
