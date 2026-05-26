import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { AIEvaluationResult, AITestQuestion } from "#/ai/schemas";
import { ScoreRing } from "./score-ring";

type ScoreReportProps = {
  score: number;
  questions: AITestQuestion[];
  evaluations: AIEvaluationResult[];
  onRetake: () => void;
};

const gradeLabel = (score: number): string => {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Review";
  return "Keep Practicing";
};

const scoreBadgeClass = (score: number) => {
  if (score >= 80)
    return "border border-green-7 bg-green-3 text-green-11";
  if (score >= 50)
    return "border border-amber-7 bg-amber-3 text-amber-11";
  return "border border-red-7 bg-red-3 text-red-11";
};

export const ScoreReport = ({
  score,
  questions,
  evaluations,
  onRetake,
}: ScoreReportProps) => {
  const correctCount = evaluations.filter((e) => e.score >= 70).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary card */}
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-gray-6 bg-gray-2 px-6 py-8 text-center">
        <ScoreRing score={score} size={96} strokeWidth={8} />

        <div className="flex flex-col gap-1">
          <p className="text-xl font-semibold text-gray-12">
            {gradeLabel(score)}
          </p>
          <p className="text-sm text-gray-11">
            {correctCount} of {questions.length} questions correct
          </p>
        </div>

        <button
          type="button"
          onClick={onRetake}
          className="inline-flex items-center gap-2 rounded-md border border-gray-6 bg-gray-1 px-4 py-2 text-sm font-medium text-gray-12 hover:bg-gray-3"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Retake Quiz
        </button>
      </div>

      {/* Question review */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-gray-12">
          Question Review
        </h2>

        <div className="flex flex-col gap-2">
          {questions.map((question, i) => {
            const evaluation = evaluations.find(
              (e) => e.questionId === question.id,
            );

            const userAnswerDisplay =
              question.type === "mcq" && evaluation
                ? (question.options.find(
                    (o) => o.id === evaluation.userAnswer,
                  )?.value ?? evaluation.userAnswer)
                : (evaluation?.userAnswer ?? "—");

            const correctAnswerDisplay =
              question.type === "mcq"
                ? (question.options.find(
                    (o) => o.id === question.correctOptionId,
                  )?.value ?? question.correctOptionId)
                : null;

            const truncatedQuestion =
              question.question.length > 80
                ? `${question.question.slice(0, 80)}…`
                : question.question;

            return (
              <Collapsible.Root key={question.id} className="group">
                <Collapsible.Trigger className="flex w-full items-center gap-3 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5 text-start text-sm hover:bg-gray-2">
                  <span className="shrink-0 font-medium text-gray-11">
                    Q{i + 1}
                  </span>
                  {evaluation && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreBadgeClass(evaluation.score)}`}
                    >
                      {evaluation.score}/100
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-gray-12">
                    {truncatedQuestion}
                  </span>
                  <ChevronDown
                    className="size-4 shrink-0 text-gray-10 transition-transform duration-200 group-data-[open]:rotate-180"
                    aria-hidden="true"
                  />
                </Collapsible.Trigger>

                <Collapsible.Panel className="overflow-hidden data-[ending-hidden]:animate-collapse data-[starting-hidden]:animate-collapse">
                  <div className="flex flex-col gap-3 rounded-b-lg border border-t-0 border-gray-6 bg-gray-1 px-3 pb-4 pt-3">
                    {/* Full question */}
                    <p className="text-sm font-medium text-gray-12">
                      {question.question}
                    </p>

                    {/* Your answer */}
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-10">
                        Your answer
                      </span>
                      <p className="text-sm text-gray-12">
                        {userAnswerDisplay || (
                          <span className="italic text-gray-9">
                            No answer provided
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Correct answer (MCQ only) */}
                    {correctAnswerDisplay && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-10">
                          Correct answer
                        </span>
                        <p className="text-sm text-green-11">
                          {correctAnswerDisplay}
                        </p>
                      </div>
                    )}

                    {/* Explanation */}
                    {evaluation?.explanation && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-10">
                          Explanation
                        </span>
                        <p className="text-sm leading-relaxed text-gray-12">
                          {evaluation.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </Collapsible.Panel>
              </Collapsible.Root>
            );
          })}
        </div>
      </div>
    </div>
  );
};
