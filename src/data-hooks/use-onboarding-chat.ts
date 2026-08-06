import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';
import { z } from 'zod';
import { dataKeys } from './keys';

/**
 * Matches `OnboardingTurnResponse` (`src/lib/onboarding-session.server.ts`),
 * which every one of `start`/`reply`/`delete` answers with. Declared inline
 * per this repo's convention (see `use-my-courses.ts`) rather than imported
 * from the server module, so this hook has no compile-time dependency on
 * server-only code.
 *
 * The `messages` shape is intentionally the narrow slice `ai`'s `UIMessage`
 * needs (`id`, `role`, `parts: { type: 'text'; text }[]`) — a structural
 * subtype, which is what lets the `messages` returned below satisfy
 * `UIMessage[]` with no cast. If a future response shape stops typechecking
 * against `UIMessage[]`, that is real information: fix the shape, don't
 * widen it away with `as`.
 */
const onboardingTurnSchema = z.object({
  status: z.enum([
    'awaiting_consent',
    'awaiting_answer',
    'confirming',
    'complete',
    'declined',
    'deleted',
    'paused',
    'failed',
  ]),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['assistant', 'user']),
      parts: z.array(z.object({ type: z.literal('text'), text: z.string() })),
    }),
  ),
  updatedAt: z.string(),
  /**
   * Present only on a `complete` turn, and null when no profile was generated
   * — an ordinary outcome, since generation is best-effort. `.nullish()`
   * rather than required so the other seven statuses can omit it entirely.
   */
  skaProfile: z
    .object({
      skills: z.string().nullable(),
      knowledge: z.string().nullable(),
      attitude: z.string().nullable(),
      reviewedAt: z.string().nullable(),
    })
    .nullish(),
});

type OnboardingTurn = z.infer<typeof onboardingTurnSchema>;

export type OnboardingStatus = OnboardingTurn['status'];

/**
 * The `/delete` route's actual response, verified against
 * `src/routes/api/course/onboarding/delete.ts` and its route test: it
 * answers with `{ ok: boolean }` only — NOT an `OnboardingTurnResponse`.
 *
 * This is a real deviation from this task's brief, which (both the original
 * plan doc and the dispatch that superseded it) describes delete's response
 * as "same shape as start's, reporting status: 'deleted'". The committed
 * route does not do that: `deleteOnboardingSession` in
 * `onboarding-session.server.ts` returns `{ ok: true }` with no transcript
 * or `updatedAt`, and the handler echoes that object verbatim. Since the
 * server sends no transcript back, this hook cannot "echo" one either — see
 * `deleteMutation`'s `onSuccess` below for how the cache is updated instead.
 */
const onboardingDeleteSchema = z.object({ ok: z.boolean() });

/**
 * Distinguishes a stale-session conflict (409 — this conversation moved on
 * in another tab or via a double-submit) and a missing course (404) from any
 * other failure, so a caller can render "this conversation continued
 * elsewhere" instead of a generic error toast for the one case that's
 * actionable. See the reply route's 409 doc comment for why this exists.
 */
export class OnboardingRequestError extends Error {
  constructor(
    public readonly kind: 'conflict' | 'not_found' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'OnboardingRequestError';
  }
}

async function postOnboardingTurn(
  path: 'start' | 'reply',
  body: unknown,
): Promise<OnboardingTurn> {
  const res = await fetch(`/api/course/onboarding/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    throw new OnboardingRequestError(
      'conflict',
      'This conversation continued elsewhere.',
    );
  }
  if (res.status === 404) {
    throw new OnboardingRequestError('not_found', 'Course not found.');
  }
  if (!res.ok) {
    throw new OnboardingRequestError(
      'unknown',
      `Onboarding request failed (${res.status})`,
    );
  }

  return onboardingTurnSchema.parse(await res.json());
}

async function postOnboardingDelete(
  courseSlug: string,
): Promise<{ ok: boolean }> {
  const res = await fetch('/api/course/onboarding/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ courseSlug }),
  });

  if (res.status === 404) {
    throw new OnboardingRequestError('not_found', 'Course not found.');
  }
  if (!res.ok) {
    throw new OnboardingRequestError(
      'unknown',
      `Failed to delete onboarding session (${res.status})`,
    );
  }

  return onboardingDeleteSchema.parse(await res.json());
}

const optimisticUserTurn = (
  text: string,
): OnboardingTurn['messages'][number] => ({
  // Prefixed distinctly from the server's `onboarding-<index>` ids
  // (`transcriptToUIMessages`) so an optimistic turn can never collide with
  // one the reconciling response brings back.
  id: `onboarding-optimistic-${crypto.randomUUID()}`,
  role: 'user',
  parts: [{ type: 'text', text }],
});

/**
 * Picks whichever candidate's `error` is an `OnboardingRequestError` AND has
 * the highest `seq` — i.e. failed most recently — rather than whichever
 * comes first in the array. `seq` is a monotonic counter, not a wall-clock
 * timestamp: immune to two failures landing in the same millisecond, which a
 * `Date.now()`-based comparison would not be.
 *
 * A pure, exported function (not inlined in the hook) specifically so this
 * precedence logic — the exact thing code review caught as a bug — can be
 * unit tested directly, without rendering `useOnboardingChat` through React.
 * That matters here: this repo's vitest setup cannot execute a bare
 * `useRef`/`useCallback`/`useEffect` inside `renderHook` (confirmed with a
 * scratch repro — a hook containing nothing but `useRef` also throws
 * `Cannot read properties of null (reading 'useRef')`), which is why none of
 * this repo's other tested data hooks touch a raw React hook; they only wrap
 * `useQuery`/`useMutation`. Keeping the selection logic pure sidesteps that
 * constraint instead of fighting it.
 *
 * Bug this fixes: `activeError` used to be `replyMutation.error ??
 * confirmMutation.error ?? deleteMutation.error ?? query.error` — fixed
 * declaration-order precedence, not recency. Concretely: a reply 409s, the
 * user then retries via delete and *that* fails with a 500 — the old code
 * still reported the stale reply conflict, because `??` only cares which
 * operand is non-null first, never which failed last.
 */
export function selectLatestOnboardingError(
  candidates: { error: unknown; seq: number }[],
): OnboardingRequestError | null {
  return (
    candidates
      .filter(
        (
          candidate,
        ): candidate is { error: OnboardingRequestError; seq: number } =>
          candidate.error instanceof OnboardingRequestError,
      )
      .reduce<{ error: OnboardingRequestError; seq: number } | null>(
        (latest, candidate) =>
          !latest || candidate.seq >= latest.seq ? candidate : latest,
        null,
      )?.error ?? null
  );
}

/**
 * Drives the three onboarding API routes (`start`, `reply`, `delete`) for one
 * course's interview, and exposes it as chat state shaped for
 * `ChatWindowProps` (`chat-window.tsx:11-18`).
 *
 * `start` doubles as this hook's `useQuery` — it's documented as idempotent
 * and safe to call repeatedly, so using it as the query function means
 * mounting the hook and calling `start()` again later (e.g. a "resume"
 * button) both go through the same idempotent read instead of needing a
 * separate GET.
 *
 * Reply and confirm are two distinct mutations/actions, not one function
 * branching on a flag: the reply route's body is a discriminated union
 * (`{ type: 'reply' }` vs `{ type: 'confirm' }`) precisely because sending a
 * REPLY while `confirming` re-triggers a correction loop rather than
 * accepting — collapsing them back into one call in the client would
 * reintroduce the same ambiguity the route's schema exists to remove. Only
 * `sendMessage` carries an optimistic turn: a confirm produces no new
 * user-visible text of its own, so there is nothing to render ahead of the
 * round trip.
 *
 * `sendMessage`'s signature (`(opts: { text: string }) => void`) matches
 * `ChatWindowProps.sendMessage` and `@ai-sdk/react`'s `useChat` (see
 * `use-chat-widget.ts`) on purpose, so the widget that plugs this hook in
 * needs no shape adapter.
 */
export function useOnboardingChat(courseSlug: string) {
  const queryClient = useQueryClient();
  const queryKey = dataKeys.onboardingSession(courseSlug);

  const query = useQuery({
    queryKey,
    queryFn: () => postOnboardingTurn('start', { courseSlug }),
    // The session can only change via one of this hook's own mutations (or
    // another tab, which the 409 guard catches on the next write from here) —
    // there's no background reason to refetch, so treat it as fresh forever
    // and let setQueryData be the only writer after the first load.
    staleTime: Number.POSITIVE_INFINITY,
  });

  const applyTurn = (turn: OnboardingTurn) => {
    queryClient.setQueryData(queryKey, turn);
  };

  /**
   * Per-source sequence numbers fed to `selectLatestOnboardingError` below.
   * A ref, not `useState`: every writer here (a mutation's `onError`, or the
   * effect watching `query.error`) already causes TanStack Query to
   * re-render this component on its own, so there's no update this ref could
   * miss by not itself being state.
   */
  const errorSeqRef = useRef({ reply: 0, confirm: 0, delete: 0, query: 0 });
  const nextErrorSeqRef = useRef(0);
  // `useCallback` with an empty dependency array (it closes over refs only,
  // never over render-scoped values) so it has a stable identity — that's
  // what lets the effect below depend on it honestly instead of needing a
  // lint suppression.
  const recordFailure = useCallback(
    (source: keyof typeof errorSeqRef.current) => {
      nextErrorSeqRef.current += 1;
      errorSeqRef.current[source] = nextErrorSeqRef.current;
    },
    [],
  );

  const replyMutation = useMutation({
    mutationFn: (text: string) => {
      const expectedUpdatedAt =
        queryClient.getQueryData<OnboardingTurn>(queryKey)?.updatedAt ?? null;
      return postOnboardingTurn('reply', {
        type: 'reply',
        courseSlug,
        text,
        expectedUpdatedAt,
      });
    },
    onMutate: (text) => {
      const previous = queryClient.getQueryData<OnboardingTurn>(queryKey);
      if (previous) {
        queryClient.setQueryData<OnboardingTurn>(queryKey, {
          ...previous,
          messages: [...previous.messages, optimisticUserTurn(text)],
        });
      }
      return { previous };
    },
    onError: (_error, _text, context) => {
      recordFailure('reply');
      // Roll the optimistic turn back — a 409 in particular means the
      // conversation moved on elsewhere, so re-showing the user's un-sent
      // text as if it landed would be actively misleading.
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: applyTurn,
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const expectedUpdatedAt =
        queryClient.getQueryData<OnboardingTurn>(queryKey)?.updatedAt ?? null;
      return postOnboardingTurn('reply', {
        type: 'confirm',
        courseSlug,
        expectedUpdatedAt,
      });
    },
    onError: () => recordFailure('confirm'),
    onSuccess: applyTurn,
  });

  const deleteMutation = useMutation({
    mutationFn: () => postOnboardingDelete(courseSlug),
    onError: () => recordFailure('delete'),
    onSuccess: () => {
      // The route's actual response is `{ ok: true }` — no transcript, no
      // `updatedAt` (see `onboardingDeleteSchema` above). Caching the prior
      // transcript here would make a permanently-withdrawn session look like
      // a live, resumable one; nothing is persisted anymore, so the messages
      // are cleared rather than echoed. `status: 'deleted'` is what the
      // widget must treat as terminal — it must not offer to continue typing
      // into this session.
      queryClient.setQueryData<OnboardingTurn>(queryKey, {
        status: 'deleted',
        messages: [],
        updatedAt: new Date().toISOString(),
        // Withdrawal deletes the SKA profile row too (see `deleteOnboarding`),
        // so the cached copy has to go with it. Leaving it would keep the card
        // — the AI's inference about this person — on screen after they asked
        // for everything to be erased, and let them "save" it back into
        // existence.
        skaProfile: null,
      });
      queryClient.setQueryData(dataKeys.skaProfile(courseSlug), null);
    },
  });

  // `useQuery` (TanStack Query v5) has no `onError` callback, so its failure
  // is recorded from the `error` value itself rather than from a callback.
  useEffect(() => {
    if (query.error) recordFailure('query');
  }, [query.error, recordFailure]);

  const turn = query.data;
  const messages: UIMessage[] = turn?.messages ?? [];

  const activeError = selectLatestOnboardingError([
    { error: replyMutation.error, seq: errorSeqRef.current.reply },
    { error: confirmMutation.error, seq: errorSeqRef.current.confirm },
    { error: deleteMutation.error, seq: errorSeqRef.current.delete },
    { error: query.error, seq: errorSeqRef.current.query },
  ]);

  return {
    messages,
    status: turn?.status,
    /**
     * The learner's SKA profile once the interview is complete, or null when
     * there is none. Null is normal, not an error — the widget renders a
     * completed onboarding with no profile as an ordinary ending.
     */
    skaProfile: turn?.skaProfile ?? null,
    isLoading:
      query.isFetching ||
      replyMutation.isPending ||
      confirmMutation.isPending ||
      deleteMutation.isPending,
    /** Sends a free-text reply. Matches `ChatWindowProps.sendMessage`. */
    sendMessage: ({ text }: { text: string }) => replyMutation.mutate(text),
    /**
     * Accepts the closing summary — the ONLY action that advances a
     * `confirming` session to `complete`. A widget should render this as a
     * distinct "looks good" affordance when `status === 'confirming'`,
     * separate from the text input calling `sendMessage`.
     */
    confirm: () => confirmMutation.mutate(),
    /** Permanently withdraws everything shared for this course. Terminal —
     * cannot be undone through this hook. */
    deleteSession: () => deleteMutation.mutate(),
    /** Runs the machine to its first settled state. Idempotent: safe to call
     * on mount and again later to resume/refresh. */
    start: () => {
      query.refetch();
    },
    /** Whichever of start/reply/confirm/delete failed *most recently* (by
     * `errorSeqRef`'s monotonic order, not declaration order — see the
     * comment above `errorSeqRef`), typed so a 409 conflict can be rendered
     * distinctly from a generic error. */
    error: activeError,
  };
}
