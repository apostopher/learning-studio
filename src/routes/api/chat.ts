import { createFileRoute } from '@tanstack/react-router';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { buildChatStream } from '#/ai/chat';
import { getUserRoleNames } from '#/db/admin';
import { appendMessages, ensureChat } from '#/db/chat';
import { getPersona } from '#/db/persona';
import { auth } from '#/lib/auth';

const chatRequestSchema = z.object({
  chatId: z.string().optional(),
  messages: z.array(z.any()).min(1),
  courseSlug: z.string().optional(),
});

/** Extracts the plain-text content of a UI message's text parts, joined. */
function textOf(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.text)
    .join('');
}

/**
 * Streaming chat endpoint: authenticates, loads the viper7 persona + the
 * caller's roles, then hands off to `buildChatStream` (ai@6 `streamText`)
 * and pipes its output back as a UI message stream. Persistence (creating/
 * continuing the chat row and appending the user + assistant turn) happens
 * in `onFinish`, after the stream has already been sent to the client —
 * a persistence failure is logged and swallowed so it can never surface as
 * a broken response for a turn the user already saw stream successfully.
 */
export async function chatHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    chatId: requestChatId,
    messages,
    courseSlug,
  } = parsed.data as {
    chatId?: string;
    messages: UIMessage[];
    courseSlug?: string;
  };

  const [persona, userRoles] = await Promise.all([
    getPersona('viper7'),
    getUserRoleNames(session.user.id),
  ]);

  const userInfo = {
    name: session.user.name ?? 'unknown',
    callSign: 'unknown',
    location: 'unknown',
    userRoles,
  };

  // TODO: no subscriptions reader exists in this repo yet — wire this up to
  // the real subscriptions source once one lands. Empty array means
  // `isAssociateFrom([])` is false, so viper7 falls back to candidate framing,
  // which is the correct default until subscriptions are available.
  const subscriptions: string[] = [];

  const lastUserMessage = messages[messages.length - 1];

  // Resolve (continue-or-create) the chat row up front, before the stream
  // starts, so the id is stable for the whole turn: it's what `onFinish`
  // appends to, and it's what we surface back to the client via the
  // `x-chat-id` header below so multi-turn continuation works (the client
  // echoes it back as `chatId` on the next request).
  const chatId = await ensureChat({
    chatId: requestChatId,
    userId: session.user.id,
    firstUserText: textOf(lastUserMessage),
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = await buildChatStream({
        messages,
        uiMessages: messages,
        persona: persona?.content,
        userInfo,
        subscriptions,
        courseSlug,
        userId: session.user.id,
        // `BuildChatStreamOptions.writer` is typed as `{ write: (p: unknown) => void }`
        // (loosened so #/ai/chat doesn't need to import ai@6's UIMessageStreamWriter
        // type directly) which is contravariantly narrower than the real ai@6
        // writer's `write`. The real writer is a structural superset (it has
        // `.write` and more), so this cast is safe at runtime.
        writer: writer as unknown as { write: (p: unknown) => void },
      });
      writer.merge(result.toUIMessageStream());
    },
    onFinish: async ({ responseMessage }) => {
      try {
        await appendMessages(chatId, [
          { role: lastUserMessage.role, parts: lastUserMessage.parts },
          { role: responseMessage.role, parts: responseMessage.parts },
        ]);
      } catch (err) {
        console.error('chat persist failed', err);
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { 'x-chat-id': chatId },
  });
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: ({ request }) => chatHandler(request),
    },
  },
});
