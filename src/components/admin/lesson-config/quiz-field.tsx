import { Plus, X } from 'lucide-react';
import type { CourseLessonQuiz } from '#/types';

const labelCls = 'font-medium text-gray-11 text-xs uppercase tracking-wide';
const controlCls =
  'rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9';

/** New id from an existing set, avoiding Math.random for stable behavior. */
function nextId(prefix: string, existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * Controlled quiz editor. Pure — the container owns the value via an RHF
 * Controller. Prose is markdown (per the quiz schema); rendered as plain
 * text inputs so tags/markdown are visible and editable.
 */
export const QuizField = ({
  value,
  onChange,
}: {
  value: CourseLessonQuiz;
  onChange: (next: CourseLessonQuiz) => void;
}) => {
  const patchQuestion = (
    qi: number,
    patch: Partial<CourseLessonQuiz[number]>,
  ) => onChange(value.map((q, i) => (i === qi ? { ...q, ...patch } : q)));

  const addQuestion = () =>
    onChange([
      ...value,
      {
        id: nextId(
          'q',
          value.map((q) => q.id),
        ),
        question: '',
        options: [
          { id: 'a', value: '' },
          { id: 'b', value: '' },
        ],
        correctOptionId: 'a',
      },
    ]);

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className={labelCls}>Quiz</legend>

      {value.map((q, qi) => (
        <div
          key={q.id}
          className="flex flex-col gap-3 rounded-lg border border-gray-6 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <label htmlFor={`quiz-q-${q.id}`} className="sr-only">
              Question {qi + 1}
            </label>
            <textarea
              id={`quiz-q-${q.id}`}
              rows={2}
              value={q.question}
              onChange={(e) => patchQuestion(qi, { question: e.target.value })}
              className={`flex-1 ${controlCls}`}
            />
            <button
              type="button"
              aria-label={`Remove question ${qi + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== qi))}
              className="rounded-md p-2 text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {q.options.map((opt, oi) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${q.id}`}
                  aria-label={`Mark option ${oi + 1} correct`}
                  checked={q.correctOptionId === opt.id}
                  onChange={() =>
                    patchQuestion(qi, { correctOptionId: opt.id })
                  }
                  className="h-4 w-4"
                />
                <label
                  htmlFor={`quiz-opt-${q.id}-${opt.id}`}
                  className="sr-only"
                >
                  Option {oi + 1}
                </label>
                <input
                  id={`quiz-opt-${q.id}-${opt.id}`}
                  value={opt.value}
                  onChange={(e) =>
                    patchQuestion(qi, {
                      options: q.options.map((o, i) =>
                        i === oi ? { ...o, value: e.target.value } : o,
                      ),
                    })
                  }
                  className={`flex-1 ${controlCls}`}
                />
                <button
                  type="button"
                  aria-label={`Remove option ${oi + 1}`}
                  onClick={() => {
                    const remaining = q.options.filter((_, i) => i !== oi);
                    patchQuestion(qi, {
                      options: remaining,
                      correctOptionId:
                        q.correctOptionId === opt.id
                          ? (remaining[0]?.id ?? '')
                          : q.correctOptionId,
                    });
                  }}
                  className="rounded-md p-2 text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patchQuestion(qi, {
                  options: [
                    ...q.options,
                    {
                      id: nextId(
                        'o',
                        q.options.map((o) => o.id),
                      ),
                      value: '',
                    },
                  ],
                })
              }
              className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-gray-11 text-sm transition-colors hover:bg-gray-4 hover:text-gray-12"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add option
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addQuestion}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-6 px-3 py-2 font-medium text-gray-11 text-sm transition-colors hover:bg-gray-4 hover:text-gray-12"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add question
      </button>
    </fieldset>
  );
};
