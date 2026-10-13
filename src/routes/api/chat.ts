import { createFileRoute } from '@tanstack/react-router';
import { waitUntil } from '@vercel/functions';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { buildChatStream } from '#/ai/chat';
import { compactChat, shouldCompact } from '#/ai/compact-chat';
import { appendMessages, ensureChat, loadChatContext } from '#/db/chat';
import { resolvePersonaForChat } from '#/db/course-orgs';
import { getActiveOrgId } from '#/lib/active-org.server';
import { auth } from '#/lib/auth';
import { HISTORY_HARD_CAP } from '#/lib/chat-history';
import { resolveChatSkaProfile } from '#/lib/ska-profile.server';

/** Longest learner message accepted, in characters. The widget sends plain
 * typed text; this bounds what is persisted and replayed to the model on every
 * later turn. */
const MAX_USER_TEXT = 8000;

const chatRequestSchema = z.object({
  chatId: z.string().optional(),
  // Exactly the new learner turn. History comes from the database
  // (loadChatContext): a client-supplied history both grew without bound
  // (Vercel 413s) and let a client put words in Viper's mouth. Only text parts
  // are accepted: `file`, `data-*` and `providerMetadata` would otherwise be
  // persisted and replayed server-side on every turn.
  messages: z
    .array(
      z.looseObject({
        id: z.string().optional(),
        role: z.literal('user'),
        parts: z
          .array(
            z.strictObject({
              type: z.literal('text'),
              text: z.string().min(1).max(MAX_USER_TEXT),
            }),
          )
          .min(1),
      }),
    )
    .length(1),
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
 * Streaming chat endpoint: authenticates, loads the viper7 persona, then
 * hands off to `buildChatStream` (ai@6 `streamText`) and pipes its output
 * back as a UI message stream. The request carries only the new user turn;
 * prior history (and the rolling summary) is loaded server-side from the
 * database via `loadChatContext`. Persistence (creating/continuing the chat
 * row and appending the user + assistant turn) happens in `onFinish`,
 * after the stream has already been sent to the client —
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

  const { chatId: requestChatId, messages, courseSlug } = parsed.data;

  const [persona, skaProfile] = await Promise.all([
    // Personas are org-level and a course may pin its own: this resolves
    // `course_orgs.personaId` → the org default → null (prompt defaults).
    // It reads published `content` only — a persona's unpublished
    // `draftContent` must never reach a live system prompt.
    resolvePersonaForChat({ orgId: getActiveOrgId(), courseSlug }),
    // Reviewed profiles only, and section-narrowed by whether a course is in
    // context — see resolveChatSkaProfile. Joins the existing parallel read
    // rather than adding a round trip of its own.
    resolveChatSkaProfile({ userId: session.user.id, courseSlug }),
  ]);

  const userInfo = {
    name: session.user.name ?? 'unknown',
    callSign: 'unknown',
    location: 'unknown',
  };

  // TODO: no subscriptions reader exists in this repo yet — wire this up to
  // the real subscriptions source once one lands. Empty array means
  // `isAssociateFrom([])` is false, so viper7 falls back to candidate framing,
  // which is the correct default until subscriptions are available.
  const subscriptions: string[] = [];

  // Built from the validated fields only, so nothing else the client put on
  // the message (extra keys, metadata) reaches the database or the model.
  const lastUserMessage: UIMessage = {
    id: messages[0].id ?? crypto.randomUUID(),
    role: 'user',
    parts: messages[0].parts,
  };

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

  // Load history on the resolved id, so a foreign `chatId` (which `ensureChat`
  // replaced with a new row) can never be read.
  const context =
    requestChatId === chatId
      ? await loadChatContext(session.user.id, chatId)
      : null;
  const history = context?.entries.map((e) => e.message) ?? [];
  const modelMessages = [...history, lastUserMessage];

  let firstStepInputTokens: Promise<number | undefined> =
    Promise.resolve(undefined);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = await buildChatStream({
        messages: modelMessages,
        uiMessages: modelMessages,
        conversationSummary: context?.summary ?? null,
        persona: persona?.content,
        // (`persona` is the resolved published content, never a draft.)
        userInfo,
        subscriptions,
        courseSlug,
        userId: session.user.id,
        skaProfile,
        // `BuildChatStreamOptions.writer` is typed as `{ write: (p: unknown) => void }`
        // (loosened so #/ai/chat doesn't need to import ai@6's UIMessageStreamWriter
        // type directly) which is contravariantly narrower than the real ai@6
        // writer's `write`. The real writer is a structural superset (it has
        // `.write` and more), so this cast is safe at runtime.
        writer: writer as unknown as { write: (p: unknown) => void },
      });
      firstStepInputTokens = Promise.resolve(result.steps).then(
        (s) => s[0]?.usage.inputTokens,
        () => undefined,
      );
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

      // Compaction is scheduled, never awaited: `onFinish` runs before the
      // response closes, so awaiting it would hold the learner's input
      // disabled while a summary is written.
      // Also compact when the history window hit its cap: the cap drops
      // messages from the model's view, so they must be folded in before
      // they fall out entirely.
      if (
        shouldCompact(await firstStepInputTokens) ||
        (context?.entries.length ?? 0) >= HISTORY_HARD_CAP
      ) {
        waitUntil(
          compactChat({ userId: session.user.id, chatId }).then(
            () => undefined,
            (err) => console.error('chat compaction failed', err),
          ),
        );
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
