import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useAtom } from 'jotai';
import { useRef } from 'react';
import { toast } from 'sonner';
import { chatWidgetOpenAtom } from '#/atoms/chat-widget';
import { AIWriterDataSchema } from '#/types';

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
 *    for every send with the request's resolved `body`; returning
 *    `{ body: { ...body, chatId: chatIdRef.current } }` injects the
 *    remembered id into every subsequent request body, matching the
 *    `chatId` field the route's `chatRequestSchema` accepts.
 */
export function useChatWidget() {
  const [isOpen, setIsOpen] = useAtom(chatWidgetOpenAtom);
  const chatIdRef = useRef<string | undefined>(undefined);

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
      prepareSendMessagesRequest: ({ body }) => ({
        body: { ...body, chatId: chatIdRef.current },
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
