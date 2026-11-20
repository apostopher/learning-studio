import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Ref } from 'react';
import type { DebriefScoredSet } from '#/data-hooks/use-debrief-attempt';
import { cn } from '#/lib/cn';
import {
  type AnswerVerdict,
  DEBRIEF_SET_PASS_SCORE,
  type SetOutcome,
} from '#/lib/debrief-sets';
import { formatScore } from '#/lib/lesson-score';
import { DebriefScoreBreakdown } from './debrief-score-breakdown';

type DebriefFeedbackProps = {
  /** "Set 1 · Question 2 of 4". */
  position: string;
  question: string;
  /** What the pilot wrote, shown back so the feedback reads against it. */
  answer: string;
  verdict: AnswerVerdict;
  score: number;
  /** Viper's words on this answer. */
  feedback: string;
  /** Present when this answer completed its set, with the total it was judged on. */
  setResult: DebriefScoredSet | null;
  /** The pilot has a quiz result for this lesson (`DebriefScoreBreakdown`). */
  quizTaken: boolean;
  /** The next step's label (`feedbackNextLabel`). */
  nextLabel: string;
  onNext: () => void;
  /** 2 under the tab strip, 3 inside the material-less "Debrief" section. */
  headingLevel: 2 | 3;
  idBase: string;
  /** Focused on mount, so the feedback is read before anything else. */
  headingRef?: Ref<HTMLHeadingElement>;
};

/** At or over the set pass mark reads as a good answer. */
const isGood = (score: number) => score >= DEBRIEF_SET_PASS_SCORE;

/**
 * Viper's feedback on the answer just given, before the pilot moves on: the
 * verdict and score, Viper's words, the answer itself, and — when the answer
 * completed a set — how the set went. The pilot moves on with one button;
 * nothing advances on its own.
 *
 * Presentational: the container decides what comes next.
 */
export const DebriefFeedback = ({
  position,
  question,
  answer,
  verdict,
  score,
  feedback,
  setResult,
  quizTaken,
  nextLabel,
  onNext,
  headingLevel,
  idBase,
  headingRef,
}: DebriefFeedbackProps) => {
  const reduced = useReducedMotion();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const headingId = `${idBase}-feedback-heading`;

  return (
    <motion.section
      aria-labelledby={headingId}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4 rounded-xl border border-gray-6 bg-gray-2 p-5"
    >
      <span className="text-xs font-medium text-tertiary tabular-nums">
        {position}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <Heading
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold text-primary outline-none"
        >
          Viper&rsquo;s feedback
        </Heading>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums',
            isGood(score)
              ? 'bg-success-3 text-success-text'
              : 'bg-warning-3 text-warning-text',
          )}
        >
          {verdict} · {score}
        </span>
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-primary">
        {feedback}
      </p>

      <details className="group text-sm">
        <summary className="cursor-pointer text-secondary hover:text-primary">
          Question and your answer
        </summary>
        <div className="mt-2 flex flex-col gap-2 border-s-2 border-gray-6 ps-3">
          <p className="font-medium text-primary">{question}</p>
          <p className="whitespace-pre-wrap text-secondary">{answer}</p>
        </div>
      </details>

      {setResult && (
        <div className="flex flex-col gap-2">
          <p
            className={cn(
              'rounded-lg px-3 py-2.5 text-sm',
              setResult.passed
                ? 'bg-success-3 text-success-text'
                : 'bg-warning-3 text-warning-text',
            )}
          >
            {setResultCopy(setResult)}
          </p>
          <DebriefScoreBreakdown
            score={setResult.score}
            quizTaken={quizTaken}
          />
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10"
        >
          {nextLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </motion.section>
  );
};

/**
 * "Set 1 average: 68." plus what it means. A set is judged on the lesson
 * total against the course's pass mark (the breakdown under it shows the sum).
 */
export function setResultCopy(r: SetOutcome): string {
  const head = `Set ${r.set} average: ${formatScore(r.average)}.`;
  return r.passed
    ? `${head} That passes the debrief.`
    : `${head} That is short of the pass mark.`;
}
