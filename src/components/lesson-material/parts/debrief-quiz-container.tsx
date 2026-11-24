import { useAtom, useSetAtom, useStore } from 'jotai';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import {
  debriefFeedbackAtom,
  debriefFocusAnswerAtom,
  debriefNotOpenAtom,
  debriefPasteBlockedAtom,
  debriefStartRequestedAtom,
  justFinishedDebriefAtom,
  startDebriefAttemptAtom,
} from '#/atoms/debrief';
import { pendingPromotionAtom } from '#/atoms/promotion';
import { ClientGate } from '#/components/client-gate';
import { LessonError } from '#/components/lesson-main/parts/lesson-error';
import {
  DebriefNotOpenError,
  DebriefRequestError,
  useAnswerDebrief,
  useContinueDebrief,
  useSaveDebriefDraft,
  useStartDebrief,
} from '#/data-hooks/use-debrief-attempt';
import { useLessonQuizResult } from '#/data-hooks/use-lesson-quiz-result';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { useAnswerMetrics } from '#/hooks/use-answer-metrics';
import { passOfferCopy } from '#/lib/debrief-copy';
import { answerVerdict, DEBRIEF_SET_PASS_SCORE } from '#/lib/debrief-sets';
import { formatDebriefTime } from '#/lib/format-debrief-time';
import {
  answerErrorCopy,
  continueErrorCopy,
  currentDebriefQuestion,
  DEBRIEF_NO_SOURCE_COPY,
  DEBRIEF_PREPARING_STALLED_COPY,
  DEBRIEF_REFUSED_COPY,
  DEBRIEF_START_FAILED_COPY,
  debriefQuizView,
  declinedDebriefReport,
  feedbackNextLabel,
  feedbackPrompt,
  finishedDebriefReport,
  questionPosition,
  startErrorOf,
} from '../compute-debrief-panel';
import { DebriefFeedback } from './debrief-feedback';
import { DebriefIntro } from './debrief-intro';
import { DebriefOffer } from './debrief-offer';
import { DebriefWait } from './debrief-wait';
import {
  type AnswerBoxEvent,
  freeTextAnswerAtom,
  QuestionCard,
} from './question-card';
import { useDebriefCountdown } from './use-debrief-countdown';

/** How long typing pauses before the answer box saves its draft. */
const DRAFT_DEBOUNCE_MS = 800;

type DebriefQuizContainerProps = {
  /** The course the debrief is being taken in — every request below names it. */
  courseSlug: string;
  lessonSlug: string;
  /** The lesson was completed at an earlier level — nothing may be started or sent. */
  readOnly: boolean;
  /** A later attempt — the intro says the misses come first. */
  retake: boolean;
  /** An attempt is already open: load it straight away, no Start press. */
  resume: boolean;
  headingLevel: 2 | 3;
  /** Re-read the debrief status (a 409 from start means it moved on). */
  refetchStatus: () => Promise<unknown>;
};

/** An ISO instant in the pilot's timezone — client-only, see formatDebriefTime. */
const DebriefTime = ({ iso }: { iso: string }) => (
  <ClientGate>{() => formatDebriefTime(iso, new Date())}</ClientGate>
);

type PendingDraft = {
  timer: ReturnType<typeof setTimeout>;
  attemptId: number;
  questionId: string;
};

/**
 * The open debrief: Start (or resume), then the questions one at a time.
 *
 * - The attempt is the server's (`useStartDebrief`): resuming lands on the
 *   first unanswered question with its saved draft in the box.
 * - Typing autosaves a draft after an 800 ms pause (a ref timer, no state).
 *   A pending draft is sent at once before a submit and on unmount. An empty
 *   box is never saved, so clearing it cannot wipe a draft on the server.
 * - Each answer goes with its metrics (`useAnswerMetrics`). Viper's feedback
 *   on it then replaces the question (`debriefFeedbackAtom`) until the pilot
 *   presses Next; nothing advances on its own. When the answer finished the
 *   attempt, Next records its report in `justFinishedDebriefAtom`, which the
 *   panel shows — so the last feedback is read before the report.
 * - A passing set 1 with a set 2 leaves the attempt on its offer (the
 *   attempt's `offer`, so a resume lands there too): Yes adds set 2's
 *   questions, No finishes the attempt at its pass and shows the report with
 *   the decline note (`useContinueDebrief`).
 */
export const DebriefQuizContainer = ({
  courseSlug,
  lessonSlug,
  readOnly,
  retake,
  resume,
  headingLevel,
  refetchStatus,
}: DebriefQuizContainerProps) => {
  const idBase = useId();
  const store = useStore();
  const [startRequested, setStartRequested] = useAtom(
    debriefStartRequestedAtom,
  );
  const setFinished = useSetAtom(justFinishedDebriefAtom);
  const startAttempt = useSetAtom(startDebriefAttemptAtom);
  const setPromotion = useSetAtom(pendingPromotionAtom);
  const [pasteBlocked, setPasteBlocked] = useAtom(debriefPasteBlockedAtom);
  // The server decides who may use the clipboard: its `adminBypass` (an
  // admin, or staff on this course), off the material query this lesson has
  // already loaded. Unknown — still loading or an error — reads as a learner.
  const { data: lessonMaterial } = useLessonMaterial({
    courseSlug,
    lessonSlug,
  });
  const clipboardAllowed =
    lessonMaterial?.locked === false && lessonMaterial.adminBypass;
  // "Quiz not taken yet" under a set's total: only once a result is known to
  // be absent (null). Still loading reads as taken, so it never flashes.
  const quizTaken = useLessonQuizResult(lessonSlug).data !== null;

  const enabled = !readOnly && (resume || startRequested === lessonSlug);
  const start = useStartDebrief({ courseSlug, lessonSlug, enabled });
  const { refetch: refetchStart } = start;
  const attempt = start.data;
  const current = attempt ? currentDebriefQuestion(attempt) : null;

  const metrics = useAnswerMetrics();
  const { mutate: saveDraft } = useSaveDebriefDraft();
  const [feedbackShown, setFeedback] = useAtom(debriefFeedbackAtom);
  const feedback =
    feedbackShown?.lessonSlug === lessonSlug &&
    feedbackShown.attemptId === attempt?.attemptId
      ? feedbackShown
      : null;
  // Set by Next, read by the next question's card: focus goes into its
  // answer box, never back to the top of the page.
  const [focusAnswer, setFocusAnswer] = useAtom(debriefFocusAnswerAtom);
  // The feedback's and the offer's headings take focus as they appear, so
  // what replaced the question is read first.
  const focusHeading = useCallback((el: HTMLHeadingElement | null) => {
    el?.focus();
  }, []);
  const answer = useAnswerDebrief({
    // `attempt` is from the latest render (TanStack v5 hands the running
    // mutation each render's options). That is still the attempt WITHOUT
    // this answer: `onAnswered` runs before `applyAnswerResult` writes it
    // to the cache, and nothing else adds it.
    onAnswered: (result, input) => {
      if (!attempt) return;
      const asked = currentDebriefQuestion(attempt);
      setFeedback({
        lessonSlug,
        attemptId: attempt.attemptId,
        questionId: input.questionId,
        position: asked ? questionPosition(asked) : '',
        question: asked?.question.question ?? '',
        answer: input.answer,
        score: result.evaluation.score,
        feedback: feedbackText(result.evaluation),
        setResult: result.setResult,
        prompt: feedbackPrompt(result),
        nextLabel: feedbackNextLabel(result),
        report: finishedDebriefReport({
          lessonSlug,
          attempt,
          questionId: input.questionId,
          result,
          now: Date.now(),
        }),
      });
    },
  });
  // ─── The offer of set 2 ─────────────────────────────────────────────────
  const continueOffer = useContinueDebrief({
    // Runs while the attempt cache still holds the attempt on its offer, so
    // a No's report is built from set 1 as it passed.
    onContinued: (result) => {
      if (result.choice === 'yes') {
        // Set 2's first question takes focus as it mounts.
        setFocusAnswer(true);
        return;
      }
      if (!attempt) return;
      setFinished(
        declinedDebriefReport({ lessonSlug, attempt, now: Date.now() }),
      );
      setStartRequested(null);
    },
  });
  const isCurrentContinue =
    continueOffer.variables?.attemptId === attempt?.attemptId;
  // A refused choice (409: answered in another tab, or the attempt closed)
  // means this page's attempt is out of date: reload it, as for an answer.
  const continueRefused =
    isCurrentContinue &&
    continueOffer.error instanceof DebriefRequestError &&
    continueOffer.error.status >= 400 &&
    continueOffer.error.status < 500;
  useEffect(() => {
    if (continueRefused) void refetchStart();
  }, [continueRefused, refetchStart]);

  const handleNext = () => {
    if (feedback === null) return;
    setFeedback(null);
    if (feedback.report) {
      setFinished(feedback.report);
      setStartRequested(null);
      return;
    }
    setFocusAnswer(true);
  };

  // ─── 409 from start: the debrief is not open after all ──────────────────
  // Recorded in an atom so it outlives the Start press being cleared:
  // `debriefQuizView` puts it before the intro, so a refused Start shows the
  // countdown and its reason, never Start again.
  const [notOpenRecord, setNotOpen] = useAtom(debriefNotOpenAtom);
  const notOpen =
    notOpenRecord?.lessonSlug === lessonSlug ? notOpenRecord : null;
  const startNotOpen =
    start.error instanceof DebriefNotOpenError ? start.error : null;
  useEffect(() => {
    if (startNotOpen === null) return;
    setNotOpen({ lessonSlug, availableAt: startNotOpen.availableAt });
    if (startNotOpen.promotion) setPromotion(startNotOpen.promotion);
    setStartRequested(null);
    // The status moves the panel on (waiting, passed).
    void refetchStatus();
  }, [
    startNotOpen,
    lessonSlug,
    setNotOpen,
    setPromotion,
    setStartRequested,
    refetchStatus,
  ]);
  // An attempt loaded after all (the countdown's refetch opened it).
  const loaded = start.status === 'success';
  useEffect(() => {
    if (loaded)
      setNotOpen((current) =>
        current?.lessonSlug === lessonSlug ? null : current,
      );
  }, [loaded, lessonSlug, setNotOpen]);
  // If the status has not caught up, count down to the time start gave.
  // `refetch` runs even with the query disabled (Start press cleared).
  useDebriefCountdown(notOpen?.availableAt ?? null, refetchStart);

  // A refused answer means this page's attempt is out of date (or no longer
  // the pilot's): reload it. A 403 there shows the refusal (`refused`).
  const answerRefused =
    answer.error instanceof DebriefRequestError &&
    answer.error.status >= 400 &&
    answer.error.status < 500;
  useEffect(() => {
    if (answerRefused) void refetchStart();
  }, [answerRefused, refetchStart]);

  // ─── Draft autosave ─────────────────────────────────────────────────────
  const pending = useRef<PendingDraft | null>(null);
  const sendDraft = useCallback(
    ({ attemptId, questionId }: Omit<PendingDraft, 'timer'>) => {
      const text = store.get(freeTextAnswerAtom);
      // Never an empty string over an existing draft.
      if (text.trim() === '') return;
      saveDraft({ attemptId, questionId, text });
    },
    [store, saveDraft],
  );
  const flushDraft = useCallback(() => {
    const draft = pending.current;
    if (draft === null) return;
    clearTimeout(draft.timer);
    pending.current = null;
    sendDraft(draft);
  }, [sendDraft]);
  useEffect(() => flushDraft, [flushDraft]);

  // ─── A new question on screen ───────────────────────────────────────────
  // Keyed on the attempt and question, so a refetch of the same attempt
  // (window focus) never overwrites what the pilot is typing.
  const questionKey =
    attempt && current ? `${attempt.attemptId}:${current.question.id}` : null;
  const draftForCurrent = useRef('');
  draftForCurrent.current = current?.draft ?? '';
  const { reset: resetMetrics } = metrics;
  // A layout effect, so the next question never paints with the previous
  // answer still in the box. Any pending draft (for the previous question)
  // is sent first, reading the box before it is overwritten.
  useLayoutEffect(() => {
    if (questionKey === null) return;
    flushDraft();
    store.set(freeTextAnswerAtom, draftForCurrent.current);
    setPasteBlocked(false);
    resetMetrics();
  }, [questionKey, flushDraft, store, setPasteBlocked, resetMetrics]);

  const view = debriefQuizView({
    readOnly,
    enabled,
    resume,
    notOpen,
    hasAttempt: attempt !== undefined,
    startError: startErrorOf({
      error: start.error,
      failureReason: start.failureReason,
    }),
    hasCurrent: current !== null,
    hasFeedback: feedback !== null,
    hasOffer: attempt?.offer === true,
  });

  switch (view) {
    case 'read-only':
    case 'intro':
      return (
        <DebriefIntro
          loading={false}
          onStart={() => {
            if (!readOnly) startAttempt(lessonSlug);
          }}
          readOnly={readOnly}
          retake={retake}
        />
      );
    case 'not-open-checking':
      return <LoadingLine label="Checking your debrief…" />;
    case 'not-open-countdown': {
      const at = notOpen?.availableAt ?? '';
      return (
        <DebriefWait
          idBase={idBase}
          headingLevel={headingLevel}
          kind="waiting"
          time={<DebriefTime iso={at} />}
        />
      );
    }
    case 'no-source':
      return (
        <p className="py-2 text-sm text-secondary">{DEBRIEF_NO_SOURCE_COPY}</p>
      );
    case 'refused':
      // 403/404: an answer, not a failure — no retry, nothing about the
      // connection.
      return (
        <p className="py-2 text-sm text-secondary">{DEBRIEF_REFUSED_COPY}</p>
      );
    case 'preparing':
      return <LoadingLine label="Preparing your debrief…" />;
    case 'preparing-stalled':
      return (
        <LessonError
          message={DEBRIEF_PREPARING_STALLED_COPY}
          onRetry={() => void refetchStart()}
          subject="your debrief"
        />
      );
    case 'start-failed':
      return (
        <LessonError
          message={DEBRIEF_START_FAILED_COPY}
          onRetry={() => void refetchStart()}
          subject="your debrief"
        />
      );
    case 'resuming':
      return <LoadingLine label="Picking up where you left off…" />;
    case 'starting':
      return (
        <DebriefIntro
          loading={true}
          onStart={() => {}}
          readOnly={false}
          retake={retake}
        />
      );
    case 'scoring':
      // Every question answered: the finishing answer's report is on its
      // way (`justFinishedDebriefAtom`), or the status refetch is.
      return <LoadingLine label="Scoring your debrief…" />;
    case 'feedback':
      if (feedback === null) return null;
      return (
        <DebriefFeedback
          position={feedback.position}
          question={feedback.question}
          answer={feedback.answer}
          verdict={answerVerdict(feedback.score)}
          score={feedback.score}
          feedback={feedback.feedback}
          setResult={feedback.setResult}
          quizTaken={quizTaken}
          prompt={feedback.prompt}
          nextLabel={feedback.nextLabel}
          onNext={handleNext}
          headingLevel={headingLevel}
          idBase={idBase}
          headingRef={focusHeading}
        />
      );
    case 'offer': {
      if (!attempt) return null;
      const choose = (choice: 'yes' | 'no') => {
        if (continueOffer.isPending) return;
        continueOffer.mutate({
          courseSlug,
          lessonSlug,
          attemptId: attempt.attemptId,
          choice,
        });
      };
      return (
        <DebriefOffer
          copy={passOfferCopy(attempt.offerQuestionCount)}
          score={attempt.setResults.at(-1)?.score ?? null}
          quizTaken={quizTaken}
          pending={
            continueOffer.isPending && isCurrentContinue
              ? (continueOffer.variables?.choice ?? null)
              : null
          }
          error={
            continueOffer.isError && isCurrentContinue
              ? continueErrorCopy(continueOffer.error)
              : ''
          }
          onYes={() => choose('yes')}
          onNo={() => choose('no')}
          headingLevel={headingLevel}
          idBase={idBase}
          headingRef={focusHeading}
        />
      );
    }
    case 'question':
      break;
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
  if (!attempt || !current) return null;

  const isCurrentAnswer = answer.variables?.questionId === current.question.id;

  const handleSubmit = (text: string) => {
    if (answer.isPending || text.trim() === '') return;
    flushDraft();
    // The card took focus when it mounted; nothing later may steal it.
    setFocusAnswer(false);
    metrics.record({ type: 'submit', at: Date.now(), length: text.length });
    answer.mutate({
      courseSlug,
      lessonSlug,
      attemptId: attempt.attemptId,
      questionId: current.question.id,
      answer: text,
      metrics: metrics.snapshot(),
    });
  };

  const handleAnswerEvent = (event: AnswerBoxEvent) => {
    metrics.record(event);
    if (event.type !== 'input') return;
    if (pending.current !== null) clearTimeout(pending.current.timer);
    const draft = {
      attemptId: attempt.attemptId,
      questionId: current.question.id,
    };
    pending.current = {
      ...draft,
      timer: setTimeout(() => {
        pending.current = null;
        sendDraft(draft);
      }, DRAFT_DEBOUNCE_MS),
    };
  };

  return (
    <div className="flex flex-col gap-3">
      <QuestionCard
        key={current.question.id}
        question={current.question}
        position={questionPosition(current)}
        autoFocusAnswer={focusAnswer}
        idBase={idBase}
        isEvaluating={answer.isPending && isCurrentAnswer}
        onSubmit={handleSubmit}
        readOnly={false}
        pasteBlockedNote={pasteBlocked}
        clipboardAllowed={clipboardAllowed}
        onBlockedPaste={() => {
          metrics.record({ type: 'paste-blocked' });
          setPasteBlocked(true);
        }}
        onAnswerEvent={handleAnswerEvent}
      />
      {/* Mounted empty, so the failure is announced when it lands. */}
      <p role="alert" className="text-sm text-error-text empty:hidden">
        {answer.isError && isCurrentAnswer ? answerErrorCopy(answer.error) : ''}
      </p>
    </div>
  );
};

/**
 * Viper's words on an answer. An attempt opened before feedback existed
 * (deploy of 2026-11-18) is graded with the new grader, so this is only a
 * guard: the revisit note, then a line that never leaves the card blank.
 */
function feedbackText(e: {
  score: number;
  feedback: string;
  revisitNote: string;
}): string {
  if (e.feedback.trim()) return e.feedback;
  if (e.revisitNote.trim()) return e.revisitNote;
  return e.score >= DEBRIEF_SET_PASS_SCORE
    ? 'That answer covered what the question asked.'
    : "Look back at this lesson's key points for what the question was after.";
}

const LoadingLine = ({ label }: { label: string }) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <div
    role="status"
    className="flex items-center gap-2 py-2 text-sm text-secondary"
  >
    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
    {label}
  </div>
);
