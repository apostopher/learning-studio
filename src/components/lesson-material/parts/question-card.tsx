import { atom, useAtom } from 'jotai';
import { Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type {
  AITestFreeTextQuestion,
  AITestMCQQuestion,
  AITestQuestion,
} from '#/ai/schemas';
import { READ_ONLY_CONTROL_REASON } from '#/lib/read-only-lesson-copy';

export const selectedOptionAtom = atom('');
export const freeTextAnswerAtom = atom('');

/** Ties every disabled control in this card to the one sentence saying why. */
const REASON_ID = 'debrief-question-readonly-reason';

// ─── MCQInput ────────────────────────────────────────────────────────────────

type MCQInputProps = {
  question: AITestMCQQuestion;
  isEvaluating: boolean;
  onSubmit: (answer: string) => void;
  /** Completed at an earlier level — nothing here may be answered or sent. */
  readOnly: boolean;
};

const MCQInput = ({
  question,
  isEvaluating,
  onSubmit,
  readOnly,
}: MCQInputProps) => {
  const [selected, setSelected] = useAtom(selectedOptionAtom);

  return (
    <div className="flex flex-col gap-4">
      <div
        role="radiogroup"
        aria-label="Answer options"
        className="flex flex-col gap-2"
      >
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <label
              key={option.id}
              className={[
                'flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
                readOnly ? 'cursor-default opacity-60' : 'cursor-pointer',
                isSelected
                  ? 'border-accent-8 bg-accent-3 text-primary'
                  : readOnly
                    ? 'border-gray-6 bg-gray-2 text-secondary'
                    : 'border-gray-6 bg-gray-2 text-secondary hover:border-gray-7 hover:bg-gray-3',
              ].join(' ')}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option.id}
                checked={isSelected}
                onChange={() => setSelected(option.id)}
                disabled={readOnly}
                aria-describedby={readOnly ? REASON_ID : undefined}
                className="sr-only"
              />
              {/* Custom radio indicator */}
              <span
                aria-hidden="true"
                className={[
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  isSelected
                    ? 'border-accent-9 bg-accent-9'
                    : 'border-gray-7 bg-transparent',
                ].join(' ')}
              >
                {isSelected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-contrast" />
                )}
              </span>
              <span className="text-sm leading-snug">{option.value}</span>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        // Inert handler, not just aria-disabled: aria-disabled does not block
        // the click, so the control itself must refuse. Deliberately NOT
        // native `disabled` for the read-only case — a disabled button is not
        // focusable, so nothing would ever announce the reason.
        onClick={() => {
          if (!readOnly) onSubmit(selected);
        }}
        disabled={!readOnly && (!selected || isEvaluating)}
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

// ─── FreeTextInput ────────────────────────────────────────────────────────────

type FreeTextInputProps = {
  question: AITestFreeTextQuestion;
  isEvaluating: boolean;
  onSubmit: (answer: string) => void;
  /** Completed at an earlier level — nothing here may be answered or sent. */
  readOnly: boolean;
};

const FreeTextInput = ({
  question: _question,
  isEvaluating,
  onSubmit,
  readOnly,
}: FreeTextInputProps) => {
  const [text, setText] = useAtom(freeTextAnswerAtom);

  return (
    <div className="flex flex-col gap-4">
      <textarea
        rows={4}
        placeholder="Type your answer..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={readOnly}
        aria-describedby={readOnly ? REASON_ID : undefined}
        className="w-full resize-none rounded-lg border border-gray-6 bg-gray-2 px-4 py-3 text-sm text-primary placeholder:text-gray-9 read-only:opacity-60 focus:border-accent-8 focus:outline-none focus:ring-2 focus:ring-accent-7"
      />

      <button
        type="button"
        // See MCQInput's Submit for why this is aria-disabled plus an inert
        // handler rather than native `disabled`.
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
  question: AITestQuestion;
  index: number;
  total: number;
  isEvaluating: boolean;
  onSubmit: (answer: string) => void;
  /**
   * The lesson was completed at an earlier level. `handleSubmit` already
   * returned silently in that state, which meant a pilot could type a full
   * answer, press Submit, and be told nothing at all.
   */
  readOnly: boolean;
};

export const QuestionCard = ({
  question,
  index,
  total,
  isEvaluating,
  onSubmit,
  readOnly,
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
        <span className="rounded-full border border-gray-6 px-2 py-0.5 text-xs font-medium text-tertiary capitalize">
          {question.type === 'mcq' ? 'Multiple choice' : 'Free text'}
        </span>
      </div>

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

      {/* Input */}
      {question.type === 'mcq' ? (
        <MCQInput
          question={question}
          isEvaluating={isEvaluating}
          onSubmit={onSubmit}
          readOnly={readOnly}
        />
      ) : (
        <FreeTextInput
          question={question}
          isEvaluating={isEvaluating}
          onSubmit={onSubmit}
          readOnly={readOnly}
        />
      )}
    </motion.div>
  );
};
