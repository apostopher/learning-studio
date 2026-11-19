import type { ReactNode, Ref } from 'react';
import type { LessonScore } from '#/lib/lesson-score';
import type { DebriefResult } from '../compute-debrief-panel';
import { DebriefScoreBreakdown } from './debrief-score-breakdown';
import { ScoreRing } from './score-ring';

type ScoreReportProps = {
  /**
   * The attempt's outcome. The ring shows `score`: the average of the set
   * that ended it (the passing one, or the last one missed).
   */
  result: DebriefResult;
  /** The lesson total the attempt ended on, summed under the averages. */
  score: LessonScore | null;
  /** The pilot has a quiz result for this lesson (`DebriefScoreBreakdown`). */
  quizTaken: boolean;
  /**
   * "Worth revisiting": the grader's note on each hole, one paragraph each
   * (`revisitNotesOf`). Not shown once passed.
   */
  revisitNotes: readonly string[];
  /** 2 under the tab strip, 3 inside the material-less "Debrief" section. */
  headingLevel: 2 | 3;
  /** The container's `useId`, so the revisit heading's id is unique per report. */
  idBase: string;
  /**
   * Under the summary: the decline note, or the two-misses prompt with
   * Retake now / Later.
   */
  footer?: ReactNode;
  /** Focused when the report appears (and after Later), so it is read first. */
  headingRef?: Ref<HTMLHeadingElement>;
};

/**
 * The report of a finished debrief attempt: its score as a ring, each set's
 * average against the pass mark, then what is worth revisiting, in readable
 * prose.
 *
 * Presentational and hookless.
 */
export const ScoreReport = ({
  result,
  score,
  quizTaken,
  revisitNotes,
  headingLevel,
  idBase,
  footer,
  headingRef,
}: ScoreReportProps) => {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const notes = result.passed ? [] : revisitNotes;
  const revisitHeadingId = `${idBase}-revisit-heading`;

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-gray-6 bg-gray-2 px-6 py-8 text-center">
        <ScoreRing score={result.score} size={96} strokeWidth={8} />

        <div className="flex flex-col gap-1">
          <Heading
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold text-primary outline-none"
          >
            {result.passed ? 'Debrief passed' : 'Not passed this time'}
          </Heading>
          <p className="text-sm text-secondary">{setSummary(result)}</p>
          {score && (
            <DebriefScoreBreakdown score={score} quizTaken={quizTaken} />
          )}
        </div>

        {footer}
      </div>

      {notes.length > 0 && (
        <section
          aria-labelledby={revisitHeadingId}
          className="flex flex-col gap-3 rounded-xl border border-gray-6 bg-gray-2 px-5 py-4"
        >
          <Heading
            id={revisitHeadingId}
            className="text-base font-semibold text-primary"
          >
            Worth revisiting
          </Heading>
          {notes.map((note) => (
            <p
              key={note}
              className="max-w-prose text-sm leading-relaxed text-primary"
            >
              {note}
            </p>
          ))}
        </section>
      )}
    </div>
  );
};

/**
 * "Set 1 average 68, set 2 average 81." An attempt from before sets has no
 * set averages: its score stands alone. What passes is the lesson total
 * against the course's pass mark (the breakdown), not a set average.
 */
export function setSummary(result: DebriefResult): string {
  const sets =
    result.setAverages.length === 0
      ? `Score ${result.score}`
      : result.setAverages
          .map((avg, i) => `${i === 0 ? 'Set' : 'set'} ${i + 1} average ${avg}`)
          .join(', ');
  return `${sets}.`;
}
