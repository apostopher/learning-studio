import { Plus, X } from 'lucide-react';
import type { CourseLessonQuiz } from '#/types';
import { RichTextEditor } from './rich-text-editor';
import { INLINE_CONTROLS } from './rich-text-toolbar';

const labelCls = 'font-medium text-secondary text-xs uppercase tracking-wide';

/** New id from an existing set, avoiding Math.random for stable behavior. */
function nextId(prefix: string, existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * Controlled quiz editor. Pure — the container owns the value via an RHF
 * Controller.
 *
 * Question and option prose are HTML, edited with RichTextEditor limited to
 * bold/italic (bubble menu on selection). Block structure is deliberately not
 * offered: a question renders as a single line and an option sits in a radio
 * row, so a heading or list there is broken layout.
 *
 * NOTE the schema's `.describe('...in markdown format')` on
 * `CourseLessonQuizQuestionSchema` is inaccurate and predates this — the stored
 * content is HTML. Measured across the imported set: 268 questions and 1037
 * options containing `<p>`, `<strong>`, `<b>`, `<em>` and zero markdown
 * emphasis. Plain inputs previously showed those tags as literal text.
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
            <div className="min-w-0 flex-1">
              <RichTextEditor
                value={q.question}
                onChange={(html) => patchQuestion(qi, { question: html })}
                toolbar="bubble"
                controls={INLINE_CONTROLS}
                ariaLabel={`Question ${qi + 1}`}
                placeholder="Question…"
              />
            </div>
            <button
              type="button"
              aria-label={`Remove question ${qi + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== qi))}
              className="rounded-md p-2 text-tertiary transition-colors hover:bg-gray-4 hover:text-primary"
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
                <div className="min-w-0 flex-1">
                  <RichTextEditor
                    value={opt.value}
                    onChange={(html) =>
                      patchQuestion(qi, {
                        options: q.options.map((o, i) =>
                          i === oi ? { ...o, value: html } : o,
                        ),
                      })
                    }
                    toolbar="bubble"
                    controls={INLINE_CONTROLS}
                    ariaLabel={`Option ${oi + 1}`}
                    placeholder="Option…"
                  />
                </div>
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
                  className="rounded-md p-2 text-tertiary transition-colors hover:bg-gray-4 hover:text-primary"
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
              className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary"
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
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-6 px-3 py-2 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add question
      </button>
    </fieldset>
  );
};
