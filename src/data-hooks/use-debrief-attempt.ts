import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { z } from 'zod';
import { extractPromotion, pendingPromotionAtom } from '#/atoms/promotion';
import type { AnswerMetrics } from '#/lib/answer-metrics';
import type { LessonRef } from '#/lib/lesson-ref';
import { invalidateLessonDoneReaders } from './invalidate-lesson-done';
import { dataKeys } from './keys';

// Mirrors `AttemptView` / `AnswerResult` in `#/lib/debrief-attempt.server`,
// which client code must not import. Questions carry text only: the server
// never sends expected answers or chunk tags.
const questionSchema = z.object({
  id: z.string(),
  question: z.string(),
  set: z.number(),
});

const scorePartSchema = z.object({
  part: z.enum(['quiz', 'debrief']),
  weight: z.number(),
  fraction: z.number(),
  points: z.number(),
});

/** `LessonScore` (`#/lib/lesson-score`): the lesson total a set was judged on. */
const lessonScoreSchema = z.object({
  total: z.number(),
  passMark: z.number(),
  passed: z.boolean(),
  parts: z.array(scorePartSchema),
});

/** `ScoredSet`: a completed set, with the lesson total on the better average so far. */
const scoredSetSchema = z.object({
  set: z.number(),
  average: z.number(),
  passed: z.boolean(),
  score: lessonScoreSchema,
});
export type DebriefScoredSet = z.infer<typeof scoredSetSchema>;

const attemptViewSchema = z.object({
  attemptId: z.number(),
  questions: z.array(questionSchema),
  answered: z.array(
    z.object({
      questionId: z.string(),
      score: z.number(),
      feedback: z.string(),
      revisitNote: z.string(),
    }),
  ),
  draft: z.object({ questionId: z.string(), text: z.string() }).nullable(),
  /** Set 1 passed and set 2 waits on the pilot's Yes / No (`useContinueDebrief`). */
  offer: z.boolean(),
  /** How many questions set 2 would ask; 0 with no offer. */
  offerQuestionCount: z.number(),
  /** One per completed set, in order. */
  setResults: z.array(scoredSetSchema),
});
export type DebriefAttemptView = z.infer<typeof attemptViewSchema>;

const answerResultSchema = z.object({
  evaluation: z.object({
    score: z.number(),
    feedback: z.string(),
    revisitNote: z.string(),
  }),
  setResult: scoredSetSchema.nullable(),
  nextQuestions: z.array(questionSchema),
  offer: z.boolean(),
  offerQuestionCount: z.number(),
  /** This answer recorded the pass. */
  passedNow: z.boolean(),
  finished: z.enum(['set-passed', 'sets-missed']).nullable(),
});
export type DebriefAnswerResult = z.infer<typeof answerResultSchema> & {
  promotion: ReturnType<typeof extractPromotion>;
};

const continueResultSchema = z.discriminatedUnion('choice', [
  z.object({ choice: z.literal('yes'), questions: z.array(questionSchema) }),
  z.object({ choice: z.literal('no'), passedNow: z.boolean() }),
]);
/**
 * The continue route's answer: set 2's questions on `yes`; on `no`, whether
 * finishing recorded a pass not yet held. `promotion` is read off the raw
 * body, as the answer's is.
 */
export type DebriefContinueResult = z.infer<typeof continueResultSchema> & {
  promotion: ReturnType<typeof extractPromotion>;
};

/**
 * The start route answered 409: the debrief is not open now (a stale tab).
 * Not a failure to show the pilot: the status refetch moves the panel on.
 * `promotion` is carried when the body has one.
 */
export class DebriefNotOpenError extends Error {
  readonly availableAt: string | null;
  readonly promotion: ReturnType<typeof extractPromotion>;
  constructor(body: unknown) {
    super('Debrief is not open');
    this.name = 'DebriefNotOpenError';
    const availableAt =
      typeof body === 'object' && body !== null && 'availableAt' in body
        ? (body as { availableAt: unknown }).availableAt
        : null;
    this.availableAt = typeof availableAt === 'string' ? availableAt : null;
    this.promotion = extractPromotion(body);
  }
}

/** 422: the lesson has nothing to build a debrief from. */
export class DebriefNoSourceError extends Error {
  constructor() {
    super('This lesson has no debrief source');
    this.name = 'DebriefNoSourceError';
  }
}

/**
 * 503: another request is still generating this lesson's first chunk list.
 * Not "nothing to debrief": `useStartDebrief` retries it (`preparingRetry`)
 * while the tab says it is preparing.
 */
export class DebriefPreparingError extends Error {
  constructor() {
    super('This debrief is still being prepared');
    this.name = 'DebriefPreparingError';
  }
}

/** How many times a preparing start is retried before the tab gives up. */
const PREPARING_RETRIES = 5;

/** TanStack `retry`: only a preparing (503) start, at most 5 times. */
export function preparingRetry(failureCount: number, error: unknown): boolean {
  return (
    error instanceof DebriefPreparingError && failureCount < PREPARING_RETRIES
  );
}

/** TanStack `retryDelay`: 1 s, 2 s, 4 s, then every 8 s. */
export function preparingRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 8000);
}

/** Any other non-2xx answer, carrying its HTTP status. */
export class DebriefRequestError extends Error {
  readonly status: number;
  constructor(what: string, status: number) {
    super(`${what} (${status})`);
    this.name = 'DebriefRequestError';
    this.status = status;
  }
}

const postJson = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export async function fetchStartDebrief({
  courseSlug,
  lessonSlug,
}: LessonRef): Promise<DebriefAttemptView> {
  const res = await postJson('/api/lesson/debrief/start', {
    courseSlug,
    lessonSlug,
  });
  if (res.status === 409) {
    throw new DebriefNotOpenError(await res.json().catch(() => null));
  }
  if (res.status === 422) throw new DebriefNoSourceError();
  if (res.status === 503) throw new DebriefPreparingError();
  if (!res.ok)
    throw new DebriefRequestError('Failed to start debrief', res.status);
  return attemptViewSchema.parse(await res.json());
}

export type AnswerDebriefInput = LessonRef & {
  attemptId: number;
  questionId: string;
  answer: string;
  metrics: AnswerMetrics;
};

export async function postDebriefAnswer({
  courseSlug,
  attemptId,
  questionId,
  answer,
  metrics,
}: AnswerDebriefInput): Promise<DebriefAnswerResult> {
  const res = await postJson('/api/lesson/debrief/answer', {
    courseSlug,
    attemptId,
    questionId,
    answer,
    metrics,
  });
  if (!res.ok)
    throw new DebriefRequestError('Failed to grade the answer', res.status);
  const json: unknown = await res.json();
  return {
    ...answerResultSchema.parse(json),
    promotion: extractPromotion(json),
  };
}

export type ContinueDebriefInput = LessonRef & {
  attemptId: number;
  choice: 'yes' | 'no';
};

/**
 * The pilot's Yes / No to the offer of set 2. A 409 (no offer: finished or
 * taken up in another tab) is a `DebriefRequestError` like any other refusal.
 */
export async function postContinueDebrief({
  courseSlug,
  attemptId,
  choice,
}: ContinueDebriefInput): Promise<DebriefContinueResult> {
  const res = await postJson('/api/lesson/debrief/continue', {
    courseSlug,
    attemptId,
    choice,
  });
  if (!res.ok)
    throw new DebriefRequestError('Failed to answer the offer', res.status);
  const json: unknown = await res.json();
  return {
    ...continueResultSchema.parse(json),
    promotion: extractPromotion(json),
  };
}

export type SaveDebriefDraftInput = {
  attemptId: number;
  questionId: string;
  text: string;
};

export async function postDebriefDraft(
  input: SaveDebriefDraftInput,
): Promise<void> {
  const res = await postJson('/api/lesson/debrief/draft', input);
  if (!res.ok)
    throw new DebriefRequestError('Failed to save draft', res.status);
}

/**
 * The attempt as it stands once `result` has been recorded: the answer, the
 * next set's questions when this answer missed a set and opened it, the set
 * it completed, and whether set 2 is now on offer.
 */
export function withAnswerRecorded(
  attempt: DebriefAttemptView,
  questionId: string,
  result: DebriefAnswerResult,
): DebriefAttemptView {
  const known = new Set(attempt.questions.map((q) => q.id));
  return {
    ...attempt,
    questions: [
      ...attempt.questions,
      ...result.nextQuestions.filter((q) => !known.has(q.id)),
    ],
    answered: [
      ...attempt.answered.filter((a) => a.questionId !== questionId),
      { questionId, ...result.evaluation },
    ],
    draft: null,
    offer: result.offer,
    offerQuestionCount: result.offerQuestionCount,
    setResults: result.setResult
      ? [
          ...attempt.setResults.filter((r) => r.set !== result.setResult?.set),
          result.setResult,
        ]
      : attempt.setResults,
  };
}

export function applyAnswerResult(
  queryClient: QueryClient,
  input: AnswerDebriefInput,
  result: DebriefAnswerResult,
) {
  queryClient.setQueryData<DebriefAttemptView>(
    dataKeys.debriefAttempt(input.courseSlug, input.lessonSlug),
    (old) => (old ? withAnswerRecorded(old, input.questionId, result) : old),
  );
  // A finished attempt changes the debrief's state and the course rollup.
  return invalidateLessonDoneReaders(queryClient, input);
}

/**
 * What the pilot's choice does to the caches. `yes`: set 2 joins the attempt
 * and the offer is gone, so the next question is set 2's first. `no`: the
 * attempt is finished (and its pass recorded), so the debrief's state and
 * the course rollup are re-read, whether or not the pass is new.
 */
export function applyContinueResult(
  queryClient: QueryClient,
  lesson: LessonRef,
  result: DebriefContinueResult,
): Promise<unknown> {
  if (result.choice === 'yes') {
    queryClient.setQueryData<DebriefAttemptView>(
      dataKeys.debriefAttempt(lesson.courseSlug, lesson.lessonSlug),
      (old) => {
        if (!old) return old;
        const known = new Set(old.questions.map((q) => q.id));
        return {
          ...old,
          questions: [
            ...old.questions,
            ...result.questions.filter((q) => !known.has(q.id)),
          ],
          offer: false,
          offerQuestionCount: 0,
        };
      },
    );
    return Promise.resolve();
  }
  return invalidateLessonDoneReaders(queryClient, lesson);
}

/**
 * Start this pilot's debrief attempt or resume the open one. `staleTime: 0`
 * so a remount always re-reads what the server holds. Retried only while the
 * lesson's chunks are still being generated (503, bounded backoff); a 409 or
 * 422 is an answer, not a blip.
 */
export function useStartDebrief({
  courseSlug,
  lessonSlug,
  enabled = true,
}: LessonRef & { enabled?: boolean }) {
  return useQuery({
    queryKey: dataKeys.debriefAttempt(courseSlug, lessonSlug),
    queryFn: () => fetchStartDebrief({ courseSlug, lessonSlug }),
    enabled: enabled && courseSlug.length > 0 && lessonSlug.length > 0,
    staleTime: 0,
    retry: preparingRetry,
    retryDelay: preparingRetryDelay,
  });
}

/**
 * Grade one answer. On success the attempt cache gets the answer (and any set
 * it opened), the status and course progress are invalidated, and a
 * promotion in the response is queued for the interstitial.
 *
 * `onAnswered` runs first, synchronously, while the attempt cache still holds
 * the attempt as it was before this answer. The quiz records Viper's feedback
 * there, so the feedback replaces the question in the same render the cache
 * moves on, never showing the next question first.
 */
export function useAnswerDebrief({
  onAnswered,
}: {
  onAnswered?: (result: DebriefAnswerResult, input: AnswerDebriefInput) => void;
} = {}) {
  const queryClient = useQueryClient();
  const setPromotion = useSetAtom(pendingPromotionAtom);
  return useMutation({
    mutationFn: postDebriefAnswer,
    onSuccess: (result, input) => {
      onAnswered?.(result, input);
      if (result.promotion) setPromotion(result.promotion);
      return applyAnswerResult(queryClient, input, result);
    },
  });
}

/**
 * Autosave of the answer being typed. The caller debounces (800 ms, ref
 * timer in the container); a failed save is silent: the next keystroke
 * saves again.
 */
export function useSaveDebriefDraft() {
  return useMutation({ mutationFn: postDebriefDraft });
}

/**
 * Answer the offer of set 2. `onContinued` runs first, synchronously, while
 * the attempt cache still holds the attempt on its offer (the quiz builds
 * the declined report from it); then the caches move on
 * (`applyContinueResult`) and a promotion is queued for the interstitial.
 */
export function useContinueDebrief({
  onContinued,
}: {
  onContinued?: (
    result: DebriefContinueResult,
    input: ContinueDebriefInput,
  ) => void;
} = {}) {
  const queryClient = useQueryClient();
  const setPromotion = useSetAtom(pendingPromotionAtom);
  return useMutation({
    mutationFn: postContinueDebrief,
    onSuccess: (result, input) => {
      onContinued?.(result, input);
      if (result.promotion) setPromotion(result.promotion);
      return applyContinueResult(queryClient, input, result);
    },
  });
}
