import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef } from 'react';
import {
  debriefCountdownAnnouncementAtom,
  debriefCountdownAtom,
  debriefPasteBlockedAtom,
  debriefStartRequestedAtom,
  justFinishedDebriefAtom,
} from '#/atoms/debrief';
import { pendingPromotionAtom } from '#/atoms/promotion';
import { ClientGate } from '#/components/client-gate';
import { LessonError } from '#/components/lesson-main/parts/lesson-error';
import {
  DebriefNoSourceError,
  DebriefNotOpenError,
  DebriefRequestError,
  useAnswerDebrief,
  useSaveDebriefDraft,
  useStartDebrief,
} from '#/data-hooks/use-debrief-attempt';
import { useAnswerMetrics } from '#/hooks/use-answer-metrics';
import { formatCountdown } from '#/lib/format-countdown';
import { formatDebriefTime } from '#/lib/format-debrief-time';
import {
  currentDebriefQuestion,
  finishedDebriefReport,
} from '../compute-debrief-panel';
import { DebriefIntro } from './debrief-intro';
import { DebriefWait } from './debrief-wait';
import {
  type AnswerBoxEvent,
  freeTextAnswerAtom,
  QuestionCard,
} from './question-card';
import { useDebriefCountdown } from './use-debrief-countdown';

/** How long typing pauses before the answer box saves its draft. */
const DRAFT_DEBOUNCE_MS = 800;

/** The answer did not reach the grader. The text stays in the box. */
export const DEBRIEF_ANSWER_FAILED_COPY =
  "Your answer didn't send. Check your connection and submit it again.";

/**
 * The server refused the answer (4xx): this page's copy of the attempt is
 * behind (answered or finished in another tab). The attempt is reloaded.
 */
export const DEBRIEF_ANSWER_REFUSED_COPY =
  "That answer wasn't accepted, so your debrief has been reloaded from where it stands. Check the question and submit again.";

/** 422 from the start route. Says why there is nothing to start. */
export const DEBRIEF_NO_SOURCE_COPY =
  'There is nothing to debrief on this lesson yet: it has no key points or video transcript to ask about.';

const DEBRIEF_START_FAILED_COPY =
  "Your debrief didn't load. Check your connection and try again.";

type DebriefQuizContainerProps = {
  /** The course the debrief is being taken in — every request below names it. */
  courseSlug: string;
  lessonSlug: string;
  /** The lesson was completed at an earlier level — nothing may be started or sent. */
  readOnly: boolean;
  /** A later attempt — the intro says the questions focus on what is not cleared. */
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
 * - Each answer goes with its metrics (`useAnswerMetrics`) and the next
 *   question follows straight away. The answer that finishes the attempt
 *   records its report in `justFinishedDebriefAtom`, which the panel shows.
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
  const setPromotion = useSetAtom(pendingPromotionAtom);
  const [pasteBlocked, setPasteBlocked] = useAtom(debriefPasteBlockedAtom);
  const countdown = useAtomValue(debriefCountdownAtom);
  const announcement = useAtomValue(debriefCountdownAnnouncementAtom);

  const enabled = !readOnly && (resume || startRequested === lessonSlug);
  const start = useStartDebrief({ courseSlug, lessonSlug, enabled });
  const { refetch: refetchStart } = start;
  const attempt = start.data;
  const current = attempt ? currentDebriefQuestion(attempt) : null;

  const metrics = useAnswerMetrics();
  const { mutate: saveDraft } = useSaveDebriefDraft();
  const answer = useAnswerDebrief({
    // `attempt` is the attempt as it stood when this answer was sent: the
    // mutation keeps the options it was started with.
    onAnswered: (result, input) => {
      if (!attempt) return;
      const report = finishedDebriefReport({
        lessonSlug,
        attempt,
        questionId: input.questionId,
        result,
        now: Date.now(),
      });
      if (report === null) return;
      setFinished(report);
      setStartRequested(null);
    },
  });

  // ─── 409 from start: the debrief is not open after all ──────────────────
  const notOpen =
    start.error instanceof DebriefNotOpenError ? start.error : null;
  useEffect(() => {
    if (notOpen === null) return;
    if (notOpen.promotion) setPromotion(notOpen.promotion);
    setStartRequested(null);
    // The status moves the panel on (retake-waiting, passed).
    void refetchStatus();
  }, [notOpen, setPromotion, setStartRequested, refetchStatus]);
  // If the status has not caught up, count down to the time start gave.
  useDebriefCountdown(notOpen?.availableAt ?? null, refetchStart);

  // A refused answer means this page's attempt is out of date: reload it.
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
  useEffect(() => {
    if (questionKey === null) return;
    store.set(freeTextAnswerAtom, draftForCurrent.current);
    setPasteBlocked(false);
    resetMetrics();
  }, [questionKey, store, setPasteBlocked, resetMetrics]);

  if (readOnly || (!attempt && !enabled)) {
    return (
      <DebriefIntro
        loading={false}
        onStart={() => {
          if (!readOnly) setStartRequested(lessonSlug);
        }}
        readOnly={readOnly}
        retake={retake}
      />
    );
  }

  if (notOpen) {
    if (notOpen.availableAt === null) {
      return <LoadingLine label="Checking your debrief…" />;
    }
    return (
      <DebriefWait
        idBase={idBase}
        headingLevel={headingLevel}
        kind="retake-waiting"
        countdown={formatCountdown(
          countdown?.availableAt === notOpen.availableAt
            ? countdown.msLeft
            : Date.parse(notOpen.availableAt) - Date.now(),
        )}
        time={<DebriefTime iso={notOpen.availableAt} />}
        announcement={announcement}
      />
    );
  }

  if (start.error instanceof DebriefNoSourceError) {
    return (
      <p className="py-2 text-sm text-secondary">{DEBRIEF_NO_SOURCE_COPY}</p>
    );
  }

  if (!attempt) {
    if (start.isError) {
      return (
        <LessonError
          message={DEBRIEF_START_FAILED_COPY}
          onRetry={() => void refetchStart()}
          subject="your debrief"
        />
      );
    }
    return resume ? (
      <LoadingLine label="Picking up where you left off…" />
    ) : (
      <DebriefIntro
        loading={true}
        onStart={() => {}}
        readOnly={false}
        retake={retake}
      />
    );
  }

  // Every question answered: the finishing answer's report is on its way
  // (`justFinishedDebriefAtom`), or the status refetch is.
  if (!current) return <LoadingLine label="Scoring your debrief…" />;

  const isCurrentAnswer = answer.variables?.questionId === current.question.id;

  const handleSubmit = (text: string) => {
    if (answer.isPending || text.trim() === '') return;
    flushDraft();
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
        index={current.index}
        total={current.total}
        isEvaluating={answer.isPending && isCurrentAnswer}
        onSubmit={handleSubmit}
        readOnly={false}
        pasteBlockedNote={pasteBlocked}
        onBlockedPaste={() => {
          metrics.record({ type: 'paste-blocked' });
          setPasteBlocked(true);
        }}
        onAnswerEvent={handleAnswerEvent}
      />
      {/* Mounted empty, so the failure is announced when it lands. */}
      <p role="alert" className="text-sm text-error-text empty:hidden">
        {answer.isError && isCurrentAnswer
          ? answerRefused
            ? DEBRIEF_ANSWER_REFUSED_COPY
            : DEBRIEF_ANSWER_FAILED_COPY
          : ''}
      </p>
    </div>
  );
};

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
