import { Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '#/lib/cn';
import type { QuizOptionState } from '#/lib/lesson-quiz';

const STATE_CLASSES: Record<QuizOptionState, string> = {
  idle: 'border-gray-6 bg-gray-2 text-primary',
  correct: 'border-success-7 bg-success-3 text-success-text',
  wrong: 'border-error-7 bg-error-3 text-error-text',
  dimmed: 'border-gray-6 bg-gray-2 text-tertiary opacity-60',
};

const BADGE_CLASSES: Record<QuizOptionState, string> = {
  idle: 'border-gray-7 text-secondary',
  correct: 'border-success-7 text-success-text',
  wrong: 'border-error-7 text-error-text',
  dimmed: 'border-gray-6 text-tertiary',
};

type QuizOptionProps = {
  letter: string;
  /** Option prose. HTML, not markdown — see the note in `quiz-field.tsx`. */
  html: string;
  state: QuizOptionState;
  /** Omitted in review mode, where options are read-only. */
  onSelect?: () => void;
  reducedMotion: boolean;
};

/**
 * One answer option.
 *
 * A real `<button>` when selectable — the previous implementation used
 * `<li onClick>`, which no keyboard or screen-reader user could reach. Not a
 * radio, because the first tap commits: radios promise a selection you can
 * change before submitting, which this quiz does not offer.
 *
 * In review mode there is no `onSelect` and the row renders as static content
 * rather than a disabled button, so a screen reader reads it as prose instead
 * of announcing a dozen unavailable controls.
 */
export const QuizOption = ({
  letter,
  html,
  state,
  onSelect,
  reducedMotion,
}: QuizOptionProps) => {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
          BADGE_CLASSES[state],
        )}
      >
        {letter}
      </span>

      <div
        className="material-prose min-w-0 flex-1 text-sm leading-snug text-start"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: quiz prose is stored as sanitized HTML upstream, same as key points
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {state === 'correct' && (
        <Check
          className="size-4 shrink-0 text-success-text"
          aria-hidden="true"
        />
      )}
      {state === 'wrong' && (
        <X className="size-4 shrink-0 text-error-text" aria-hidden="true" />
      )}
    </>
  );

  const rowClass = cn(
    'flex w-full items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
    STATE_CLASSES[state],
    onSelect && 'cursor-pointer hover:border-gray-8 hover:bg-gray-3',
  );

  return (
    <motion.li
      // translateX along the visual axis is an allowed physical exception: a
      // shake reads as a shake in any writing mode.
      animate={
        reducedMotion
          ? undefined
          : state === 'wrong'
            ? { x: [0, -4, 4, -4, 0] }
            : state === 'correct'
              ? { scale: [1, 1.02, 1] }
              : {}
      }
      transition={{ duration: 0.3 }}
    >
      {onSelect ? (
        <button type="button" onClick={onSelect} className={rowClass}>
          {content}
        </button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </motion.li>
  );
};
