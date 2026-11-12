import { atom, useAtom } from 'jotai';
import { Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { MetricsEvent } from '#/hooks/use-answer-metrics';
import { READ_ONLY_CONTROL_REASON } from '#/lib/read-only-lesson-copy';

export const freeTextAnswerAtom = atom('');

/** What the pilot sees when a paste, drop, copy or cut is refused. */
export const PASTE_BLOCKED_NOTE =
  'Answers have to be typed — pasting is turned off for debriefs.';

/** A question as the pilot sees it: text only, from the start route. */
type DebriefQuestion = { id: string; question: string };

/** Events the card can report; the rest of `MetricsEvent` is the container's. */
export type AnswerBoxEvent = Extract<
  MetricsEvent,
  { type: 'keydown' | 'input' }
>;

/** Ties every disabled control in this card to the one sentence saying why. */
const REASON_ID = 'debrief-question-readonly-reason';
const NOTE_ID = 'debrief-question-paste-note';

// ─── FreeTextInput ────────────────────────────────────────────────────────────

type FreeTextInputProps = {
  isEvaluating: boolean;
  onSubmit: (answer: string) => void;
  /** Completed at an earlier level — nothing here may be answered or sent. */
  readOnly: boolean;
  pasteBlockedNote: boolean;
  onBlockedPaste: () => void;
  onAnswerEvent: (event: AnswerBoxEvent) => void;
};

const FreeTextInput = ({
  isEvaluating,
  onSubmit,
  readOnly,
  pasteBlockedNote,
  onBlockedPaste,
  onAnswerEvent,
}: FreeTextInputProps) => {
  const [text, setText] = useAtom(freeTextAnswerAtom);
  const describedBy =
    [readOnly ? REASON_ID : null, pasteBlockedNote ? NOTE_ID : null]
      .filter(Boolean)
      .join(' ') || undefined;
  // Typed answers only: refuse anything that moves text in or out of the box
  // other than the keyboard, and tell the pilot why nothing happened.
  const refuse = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    onBlockedPaste();
  };

  return (
    <div className="flex flex-col gap-4">
      <textarea
        rows={4}
        placeholder="Type your answer..."
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          onAnswerEvent({
            type: 'input',
            deltaRemoved: Math.max(0, text.length - next.length),
            length: next.length,
          });
          setText(next);
        }}
        onKeyDown={() => onAnswerEvent({ type: 'keydown', at: Date.now() })}
        onPaste={refuse}
        onDrop={refuse}
        onCopy={refuse}
        onCut={refuse}
        readOnly={readOnly}
        aria-describedby={describedBy}
        className="w-full resize-none rounded-lg border border-gray-6 bg-gray-2 px-4 py-3 text-sm text-primary placeholder:text-tertiary read-only:opacity-60 focus:border-accent-8 focus:outline-none focus:ring-2 focus:ring-accent-7"
      />

      {/* Mounted before it has anything to say: a live region added with its
          text already inside is not reliably announced. */}
      <p
        id={NOTE_ID}
        aria-live="polite"
        className="text-xs text-secondary empty:hidden"
      >
        {pasteBlockedNote ? PASTE_BLOCKED_NOTE : ''}
      </p>

      <button
        type="button"
        // aria-disabled plus an inert handler rather than native `disabled`
        // in the read-only case: a disabled button is not focusable, so
        // nothing would ever announce the reason.
        onClick={() => {
          if (!readOnly) onSubmit(text);
        }}
        disabled={!readOnly && (!text.trim() || isEvaluating)}
        aria-disabled={readOnly || undefined}
        aria-describedby={readOnly ? REASON_ID : undefined}
        className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-60"
      >
        {isEvaluating && <Loader2 size={14} className="animate-spin" />}
        Submit
      </button>
    </div>
  );
};

// ─── QuestionCard ─────────────────────────────────────────────────────────────

type QuestionCardProps = {
  question: DebriefQuestion;
  index: number;
  total: number;
  /** Shown above the question — the second set's opening note, else null. */
  notice?: string | null;
  isEvaluating: boolean;
  onSubmit: (answer: string) => void;
  /**
   * The lesson was completed at an earlier level. `handleSubmit` already
   * returned silently in that state, which meant a pilot could type a full
   * answer, press Submit, and be told nothing at all.
   */
  readOnly: boolean;
  /** A paste/drop/copy/cut was just refused: show the note. */
  pasteBlockedNote: boolean;
  onBlockedPaste: () => void;
  onAnswerEvent: (event: AnswerBoxEvent) => void;
};

export const QuestionCard = ({
  question,
  index,
  total,
  notice = null,
  isEvaluating,
  onSubmit,
  readOnly,
  pasteBlockedNote,
  onBlockedPaste,
  onAnswerEvent,
}: QuestionCardProps) => {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4 rounded-xl border border-gray-6 bg-gray-2 p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-tertiary tabular-nums">
          {index + 1} of {total}
        </span>
      </div>

      {notice && (
        <p className="rounded-lg border border-gray-6 bg-gray-3 px-3 py-2.5 text-sm text-secondary">
          {notice}
        </p>
      )}

      {/* Question text */}
      <p className="text-sm font-medium leading-relaxed text-primary">
        {question.question}
      </p>

      {/* Visible, not sr-only — same reasoning as DebriefIntro's reason text. */}
      {readOnly && (
        <p id={REASON_ID} className="text-xs text-tertiary">
          {READ_ONLY_CONTROL_REASON}
        </p>
      )}

      <FreeTextInput
        isEvaluating={isEvaluating}
        onSubmit={onSubmit}
        readOnly={readOnly}
        pasteBlockedNote={pasteBlockedNote}
        onBlockedPaste={onBlockedPaste}
        onAnswerEvent={onAnswerEvent}
      />
    </motion.div>
  );
};
