import { useChat } from '@ai-sdk/react';
import { useParams } from '@tanstack/react-router';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useAtom } from 'jotai';
import { useRef } from 'react';
import { toast } from 'sonner';
import { chatWidgetOpenAtom } from '#/atoms/chat-widget';
import { AIWriterDataSchema } from '#/types';

/**
 * Assembles the outgoing `/api/chat` request body. Pulled out of
 * `prepareSendMessagesRequest` below as a pure function specifically so it's
 * unit-testable: this repo's Vite pipeline (react-compiler + TanStack Start
 * under Vitest) nulls the React hook dispatcher for any hook that calls a raw
 * React/router hook (`useRef`, `useParams`, ...) when exercised via
 * `renderHook` — a pre-existing, repo-wide infra issue documented on the
 * skipped tests in `use-chat-window-geometry.test.ts` and on
 * `use-onboarding-chat.test.ts`'s `selectLatestOnboardingError` extraction,
 * which uses this exact same workaround. `useChatWidget` itself (below) is
 * NOT covered by a render test for that reason; this function is the
 * verifiable half of its `courseSlug` plumbing — the other half, `useParams`
 * actually reading the matched route's `courseSlug`, is type-checked but
 * otherwise verified only by static reading.
 *
 * `prepareSendMessagesRequest`'s returned `body` REPLACES the transport's
 * default body (it does NOT merge), so every field the route needs —
 * `id`/`messages`/`trigger`/`messageId` from the transport, plus `chatId`
 * and `courseSlug` from the hook — must be reconstructed here explicitly.
 */
export function buildChatRequestBody(input: {
  id: string;
  messages: UIMessage[];
  trigger: 'submit-message' | 'regenerate-message';
  messageId: string | undefined;
  body: Record<string, unknown> | undefined;
  chatId: string | undefined;
  courseSlug: string | undefined;
}) {
  const { id, messages, trigger, messageId, body, chatId, courseSlug } = input;
  return { id, messages, trigger, messageId, ...body, chatId, courseSlug };
}

/**
 * Data layer for the chat widget: wraps `@ai-sdk/react`'s `useChat`, pointed
 * at this repo's `POST /api/chat` streaming endpoint (`src/routes/api/chat.ts`).
 *
 * Session persistence (`x-chat-id`): the server resolves (creates-or-
 * continues) one `aiChats` row per conversation up front and returns its id
 * in the `x-chat-id` response header; it also accepts `chatId` in the
 * request body to continue that same row on subsequent turns. To keep every
 * turn of a session writing to ONE row:
 *  - a `chatIdRef` holds the last-seen id across renders (a ref, not state —
 *    nothing in the UI needs to re-render when it changes).
 *  - **incoming:** `DefaultChatTransport`'s `fetch` option (see
 *    `HttpChatTransportInitOptions.fetch` — `fetch?: FetchFunction` where
 *    `FetchFunction = typeof globalThis.fetch`, in
 *    `node_modules/ai/dist/index.d.ts`) lets us pass a wrapper that calls
 *    the real `fetch`, reads `x-chat-id` off the `Response`, stashes it in
 *    the ref, then returns the response untouched. ai@6 has no separate
 *    "on response" hook on the transport, so this fetch wrapper is the
 *    documented interception point.
 *  - **outgoing:** `DefaultChatTransport`'s `prepareSendMessagesRequest`
 *    option (`PrepareSendMessagesRequest<UI_MESSAGE>`, same file) is called
 *    for every send. Its returned `body` REPLACES the whole request body —
 *    it does NOT merge with the transport's default — so we must reconstruct
 *    the standard fields (`id`, `messages`, `trigger`, `messageId`) ourselves
 *    and add `chatId`. (Only spreading the `body` arg drops `messages`, which
 *    is `undefined` here since we pass no custom `body` → the route's
 *    `chatRequestSchema` then rejects the empty payload with a 400.)
 */
export function useChatWidget() {
  const [isOpen, setIsOpen] = useAtom(chatWidgetOpenAtom);
  const chatIdRef = useRef<string | undefined>(undefined);
  // `strict: false` reads whatever route is currently matched without
  // requiring this hook's caller to be inside a course route — the widget is
  // mounted once at the app root (`__root.tsx`) and stays mounted across
  // every route, course-scoped or not (e.g. `/app` has no course, and
  // `courseSlug` is `undefined` there, which is expected).
  const { courseSlug } = useParams({ strict: false });

  const { messages, status, sendMessage } = useChat({
    id: 'viper7-widget',
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: async (input, init) => {
        const response = await globalThis.fetch(input, init);
        const id = response.headers.get('x-chat-id');
        if (id) {
          chatIdRef.current = id;
        }
        return response;
      },
      prepareSendMessagesRequest: ({
        id,
        messages,
        trigger,
        messageId,
        body,
      }) => ({
        body: buildChatRequestBody({
          id,
          messages,
          trigger,
          messageId,
          body,
          chatId: chatIdRef.current,
          courseSlug,
        }),
      }),
    }),
    onData: (dataPart) => {
      const parsed = AIWriterDataSchema.safeParse(dataPart);
      if (parsed.success) {
        // `data-notification` needs no handling here — it's rendered
        // directly in the message list. The old widget's geolocation
        // `data-request` branch is intentionally dropped (deferred); there's
        // no other `data-request` kind yet, so nothing is left to do for
        // either known variant.
        return;
      }

      // Defensive/forward-compatible: some data parts carry a nested
      // `{ type: 'error', errorText }` payload that isn't (yet) part of
      // `AIWriterDataSchema`. Surface it as a toast, same as the old widget.
      if (
        dataPart.data &&
        typeof dataPart.data === 'object' &&
        'type' in dataPart.data
      ) {
        const errorData = dataPart.data as {
          type: string;
          errorText?: string;
        };
        if (errorData.type === 'error') {
          const errorMessage = errorData.errorText || 'An error occurred';
          if (errorMessage === 'Insufficient Balance') {
            toast.error('Insufficient Balance', {
              description: 'Please contact support to resolve this issue.',
              duration: 5000,
            });
          } else {
            toast.error(errorMessage);
          }
        }
      }
    },
    onError: (error) => {
      toast.error(
        error.message || 'An unexpected error occurred. Please try again.',
      );
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  return {
    isOpen,
    setIsOpen,
    messages,
    sendMessage,
    status,
    isLoading,
    chatId: chatIdRef.current,
  };
}
