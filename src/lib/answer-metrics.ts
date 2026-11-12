import { z } from 'zod';

const count = z.number().int().nonnegative();

/**
 * How a pilot went about answering one debrief question, sent with the
 * answer and stored in `debrief_answer_logs`. Times are milliseconds.
 *
 * Forward hook: nothing reads these in v1. They are kept for research into
 * detecting when a pilot is struggling with a question (spec decision 9), so
 * the shape is fixed now and a later reader has history to work from.
 */
export const AnswerMetricsSchema = z.object({
  /** Question shown → answer submitted. */
  msOnQuestion: count,
  /** Question shown → first keystroke. */
  msToFirstKey: count,
  /** Deleting key presses or input events. */
  deletions: count,
  charsDeleted: count,
  /** Times more than half of the answer so far was deleted in one run. */
  rewrites: count,
  /** Paste or drop attempts the answer box refused. */
  pasteBlocked: count,
  /** Time the tab was hidden while the question was shown. */
  msHidden: count,
  finalLength: count,
});
export type AnswerMetrics = z.infer<typeof AnswerMetricsSchema>;

/** The longest answer, or saved draft, a debrief accepts. */
export const DEBRIEF_ANSWER_MAX_CHARS = 10_000;
