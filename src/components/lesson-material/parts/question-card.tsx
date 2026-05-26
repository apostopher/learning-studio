import { atom, useAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type {
  AITestMCQQuestion,
  AITestFreeTextQuestion,
  AITestQuestion,
} from "#/ai/schemas";

export const selectedOptionAtom = atom("");
export const freeTextAnswerAtom = atom("");

// ─── MCQInput ────────────────────────────────────────────────────────────────

type MCQInputProps = {
  question: AITestMCQQuestion;
  isEvaluating: boolean;
  onSubmit: (answer: string) => void;
};

const MCQInput = ({ question, isEvaluating, onSubmit }: MCQInputProps) => {
  const [selected, setSelected] = useAtom(selectedOptionAtom);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Answer options" className="flex flex-col gap-2">
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <label
              key={option.id}
              className={[
                "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                isSelected
                  ? "border-accent-8 bg-accent-3 text-gray-12"
                  : "border-gray-6 bg-gray-2 text-gray-11 hover:border-gray-7 hover:bg-gray-3",
              ].join(" ")}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option.id}
                checked={isSelected}
                onChange={() => setSelected(option.id)}
                className="sr-only"
              />
              {/* Custom radio indicator */}
              <span
                aria-hidden="true"
                className={[
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  isSelected
                    ? "border-accent-9 bg-accent-9"
                    : "border-gray-7 bg-transparent",
                ].join(" ")}
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
        onClick={() => onSubmit(selected)}
        disabled={!selected || isEvaluating}
        className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10 disabled:cursor-not-allowed disabled:opacity-50"
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
};

const FreeTextInput = ({
  question: _question,
  isEvaluating,
  onSubmit,
}: FreeTextInputProps) => {
  const [text, setText] = useAtom(freeTextAnswerAtom);

  return (
    <div className="flex flex-col gap-4">
      <textarea
        rows={4}
        placeholder="Type your answer..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full resize-none rounded-lg border border-gray-6 bg-gray-2 px-4 py-3 text-sm text-gray-12 placeholder:text-gray-9 focus:border-accent-8 focus:outline-none focus:ring-2 focus:ring-accent-7"
      />

      <button
        type="button"
        onClick={() => onSubmit(text)}
        disabled={!text.trim() || isEvaluating}
        className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10 disabled:cursor-not-allowed disabled:opacity-50"
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
};

export const QuestionCard = ({
  question,
  index,
  total,
  isEvaluating,
  onSubmit,
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
        <span className="text-xs font-medium text-gray-10 tabular-nums">
          {index + 1} of {total}
        </span>
        <span className="rounded-full border border-gray-6 px-2 py-0.5 text-xs font-medium text-gray-10 capitalize">
          {question.type === "mcq" ? "Multiple choice" : "Free text"}
        </span>
      </div>

      {/* Question text */}
      <p className="text-sm font-medium leading-relaxed text-gray-12">
        {question.question}
      </p>

      {/* Input */}
      {question.type === "mcq" ? (
        <MCQInput
          question={question}
          isEvaluating={isEvaluating}
          onSubmit={onSubmit}
        />
      ) : (
        <FreeTextInput
          question={question}
          isEvaluating={isEvaluating}
          onSubmit={onSubmit}
        />
      )}
    </motion.div>
  );
};
