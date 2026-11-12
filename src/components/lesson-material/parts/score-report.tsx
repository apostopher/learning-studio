import type { ReactNode } from 'react';
import { ScoreRing } from './score-ring';

type ScoreReportProps = {
  /**
   * Knowledge-chunk mastery after the attempt. `percent` is
   * `masteryPercent` — 100 once passed — and is what the ring shows.
   */
  mastery: { cleared: number; total: number; percent: number; passed: boolean };
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
   * Under the summary: the countdown to the next attempt. There is no Retake
   * button — the next attempt opens only when the wait is over.
   */
  footer?: ReactNode;
};

/**
 * The report of a finished debrief attempt: mastery so far as a ring and a
 * count of chunks cleared, then what is worth revisiting, in readable prose.
 *
 * Presentational and hookless.
 */
export const ScoreReport = ({
  mastery,
  revisitNotes,
  headingLevel,
  idBase,
  footer,
}: ScoreReportProps) => {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const notes = mastery.passed ? [] : revisitNotes;
  const revisitHeadingId = `${idBase}-revisit-heading`;

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-gray-6 bg-gray-2 px-6 py-8 text-center">
        <ScoreRing score={mastery.percent} size={96} strokeWidth={8} />

        <div className="flex flex-col gap-1">
          <Heading className="text-xl font-semibold text-primary">
            {mastery.passed ? 'Debrief passed' : 'Attempt finished'}
          </Heading>
          <p className="text-sm text-secondary">
            {mastery.cleared} of {mastery.total} knowledge chunks cleared
          </p>
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
