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
});
export type DebriefAttemptView = z.infer<typeof attemptViewSchema>;

const answerResultSchema = z.object({
  evaluation: z.object({
    score: z.number(),
    feedback: z.string(),
    revisitNote: z.string(),
  }),
  setResult: z
    .object({ set: z.number(), average: z.number(), passed: z.boolean() })
    .nullable(),
  nextQuestions: z.array(questionSchema),
  finished: z.enum(['set-passed', 'sets-missed']).nullable(),
});
export type DebriefAnswerResult = z.infer<typeof answerResultSchema> & {
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
 * The attempt as it stands once `result` has been recorded: the answer, and
 * the next set's questions when this answer missed a set and opened it.
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
  };
}

export function applyAnswerResult(
  queryClient: QueryClient,
  input: AnswerDebriefInput,
  result: DebriefAnswerResult,
) {
  queryClient.setQueryData<DebriefAttemptView>(
    dataKeys.debriefAttempt(input.lessonSlug),
    (old) => (old ? withAnswerRecorded(old, input.questionId, result) : old),
  );
  // A finished attempt changes the debrief's state and the course rollup.
  return invalidateLessonDoneReaders(queryClient, input);
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
    queryKey: dataKeys.debriefAttempt(lessonSlug),
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
