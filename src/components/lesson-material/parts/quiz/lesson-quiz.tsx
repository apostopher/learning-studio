import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useRef } from 'react';
import type { QuizAnswerMap } from '#/lib/lesson-quiz';
import type { CourseLessonQuiz, CourseLessonQuizAnswers } from '#/types';
import { QuizQuestion } from './quiz-question';
import { QuizResult, type QuizSaveState } from './quiz-result';

/**
 * Which way "forward" points. A slide is a visual-axis transform, so a physical
 * translateX is the allowed exception — but a *hardcoded* direction would send
 * the next question in from the wrong side under RTL.
 *
 * Cached at module level rather than held in state: document direction does not
 * change during a session, and the repo's state rules rule out `useState`.
 */
let cachedDirectionSign: number | null = null;
function inlineDirectionSign(): number {
  if (cachedDirectionSign !== null) return cachedDirectionSign;
  if (typeof document === 'undefined') return 1;
  cachedDirectionSign =
    getComputedStyle(document.documentElement).direction === 'rtl' ? -1 : 1;
  return cachedDirectionSign;
}

const SLIDE_SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

type LessonQuizProps = {
  questions: CourseLessonQuiz;
  /** `questions.length` means the result slide. */
  index: number;
  answers: QuizAnswerMap;
  revealedQuestionId: string | null;
  /** Text for the live region; the reveal is otherwise purely visual. */
  announcement: string;
  /** The snapshot to review. Non-null exactly when `index === questions.length`. */
  resultAnswers: CourseLessonQuizAnswers | null;
  saveState: QuizSaveState;
  onSelect: (optionId: string) => void;
  onNext: () => void;
  onRetake: () => void;
  onRetrySave: () => void;
};

export const LessonQuiz = ({
  questions,
  index,
  answers,
  revealedQuestionId,
  announcement,
  resultAnswers,
  saveState,
  onSelect,
  onNext,
  onRetake,
  onRetrySave,
}: LessonQuizProps) => {
  const reducedMotion = useReducedMotion() ?? false;
  const hasMountedSlide = useRef(false);

  /**
   * Move focus onto each new slide as it attaches.
   *
   * Done with a ref callback rather than an effect on `index`: under
   * `mode="wait"` the outgoing slide is still mounted when the index changes,
   * so an effect would focus the element that is on its way out. Skipping the
   * first attachment matters just as much — focusing on mount would steal focus
   * the moment the Quiz tab opens.
   */
  const focusSlide = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    if (!hasMountedSlide.current) {
      hasMountedSlide.current = true;
      return;
    }
    node.focus({ preventScroll: true });
  }, []);

  const total = questions.length;
  const isResult = index >= total;
  const question = isResult ? null : questions[index];
  const answeredCount = isResult ? total : index;
  const progressPercent = total === 0 ? 0 : (answeredCount / total) * 100;
  const slideOffset = 40 * inlineDirectionSign();

  return (
    <div className="flex flex-col gap-4">
      {!isResult && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-tertiary tabular-nums">
            Question {index + 1} of {total}
          </p>
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-gray-4"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={answeredCount}
            aria-label="Quiz progress"
          >
            {/* Percentage width fills from the inline start in both writing
                modes — block layout places it per the inherited direction. */}
            <motion.div
              className="h-full rounded-full bg-accent-9"
              animate={{ width: `${progressPercent}%` }}
              transition={reducedMotion ? { duration: 0 } : SLIDE_SPRING}
            />
          </div>
        </div>
      )}

      {/* One stable live region for the whole carousel. A region that mounts
          together with its text is often not announced at all. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* `layout` animates the panel's height between slides: option counts
          differ per question, and the jump into the tall result slide is
          otherwise violent. */}
      <motion.div layout={!reducedMotion}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={isResult ? 'result' : question?.id}
            ref={focusSlide}
            tabIndex={-1}
            aria-label={
              isResult ? 'Quiz results' : `Question ${index + 1} of ${total}`
            }
            className="outline-hidden"
            initial={
              reducedMotion ? { opacity: 0 } : { opacity: 0, x: slideOffset }
            }
            animate={{ opacity: 1, x: 0 }}
            exit={
              reducedMotion ? { opacity: 0 } : { opacity: 0, x: -slideOffset }
            }
            transition={reducedMotion ? { duration: 0.15 } : SLIDE_SPRING}
          >
            {isResult && resultAnswers ? (
              <QuizResult
                answers={resultAnswers}
                saveState={saveState}
                onRetrySave={onRetrySave}
                onRetake={onRetake}
                reducedMotion={reducedMotion}
              />
            ) : question ? (
              <QuizQuestion
                question={question}
                index={index}
                total={total}
                chosenOptionId={answers[question.id]}
                revealed={revealedQuestionId === question.id}
                onSelect={onSelect}
                onNext={onNext}
                reducedMotion={reducedMotion}
              />
            ) : null}
          </motion.section>
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
