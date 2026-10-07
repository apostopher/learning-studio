import { createFileRoute } from '@tanstack/react-router';
import type { UIMessage } from 'ai';
import { buildChatStream } from '#/ai/chat';
import {
  VOICE_FALLBACK_REPLY,
  VOICE_NO_TURN_REPLY,
} from '#/ai/prompts/voice-mode';
import { getChat } from '#/db/chat';
import { resolvePersonaForChat } from '#/db/course-orgs';
import { getCallByConversation } from '#/db/video-calls';
import { env } from '#/env';
import { getActiveOrgId } from '#/lib/active-org.server';
import {
  openAISseResponse,
  toOpenAIChatCompletionStream,
} from '#/lib/openai-sse';
import { secretMatches } from '#/lib/secret-matches.server';
import { resolveChatSkaProfile } from '#/lib/ska-profile.server';
import {
  splitTavusMessages,
  TAVUS_CONFIG_CHECK_ID,
  tavusCompletionRequestSchema,
} from '#/lib/tavus-messages';

const MODEL = 'viper7';

/**
 * How much of the stored text chat a call turn replays. Every spoken turn is
 * a fresh completion, so an unbounded history would grow latency (time to
 * first word) and cost with the chat's age; the last 30 messages carry the
 * conversation that led into the call.
 */
const PRIOR_HISTORY_LIMIT = 30;

async function* once(text: string) {
  yield text;
}

/**
 * Tavus's custom-LLM endpoint: the brain behind the video replica.
 *
 * Tavus has no user session, so identity comes from the `conversation-id`
 * header (verified in the spike) looked up against an ACTIVE `video_calls`
 * row, behind the persona's bearer secret. From there it is `/api/chat`'s
 * context — org persona, SKA profile, course-scoped searchKB with gating —
 * plus the chat's persisted messages so the call knows the text conversation
 * that preceded it. Nothing is persisted here: replies can be interrupted
 * mid-stream, so the transcript is taken from Tavus after the call.
 */
export async function tavusCompletionsHandler(
  request: Request,
): Promise<Response> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!secretMatches(authorization, `Bearer ${env.TAVUS_LLM_SECRET}`)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = tavusCompletionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const conversationId =
    request.headers.get('conversation-id') ??
    request.headers.get('conversation_id');

  if (conversationId === TAVUS_CONFIG_CHECK_ID) {
    return openAISseResponse(
      toOpenAIChatCompletionStream(
        async () => once('Custom LLM configuration test successful.'),
        { model: MODEL, fallbackText: '' },
      ),
    );
  }

  const call = conversationId
    ? await getCallByConversation(conversationId)
    : null;
  if (!call || call.status !== 'active') {
    return new Response('Unauthorized', { status: 401 });
  }

  const { tavusRules, history } = splitTavusMessages(parsed.data.messages);
  const courseSlug = call.courseSlug ?? undefined;

  const stream = toOpenAIChatCompletionStream(
    async () => {
      if (!history.some((m) => m.role === 'user'))
        return once(VOICE_NO_TURN_REPLY);

      const [persona, skaProfile, chat] = await Promise.all([
        resolvePersonaForChat({ orgId: getActiveOrgId(), courseSlug }),
        resolveChatSkaProfile({ userId: call.userId, courseSlug }),
        getChat(call.userId, call.chatId),
      ]);
      // Only learner/viper7 turns: a stored `system` row (rows are written
      // from client-sent messages; role is free text) must never replay as a
      // system prompt.
      const prior: UIMessage[] = (chat?.messages ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-PRIOR_HISTORY_LIMIT)
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          parts: m.parts as UIMessage['parts'],
        }));
      const messages = [...prior, ...history];

      const result = await buildChatStream({
        messages,
        uiMessages: messages,
        persona: persona?.content,
        userInfo: {
          name: call.userName ?? 'unknown',
          callSign: 'unknown',
          location: 'unknown',
        },
        // Same as /api/chat until a subscriptions reader exists.
        subscriptions: [],
        courseSlug,
        userId: call.userId,
        skaProfile,
        voice: { tavusRules },
        abortSignal: request.signal,
      });
      return result.textStream;
    },
    {
      model: MODEL,
      fallbackText: VOICE_FALLBACK_REPLY,
      signal: request.signal,
      onError: (err) => console.error('tavus completion failed', err),
    },
  );

  return openAISseResponse(stream);
}

export const Route = createFileRoute('/api/tavus/v1/chat/completions')({
  server: {
    handlers: {
      POST: ({ request }) => tavusCompletionsHandler(request),
    },
  },
});
