import { createFileRoute } from '@tanstack/react-router';
import { addSeconds } from 'date-fns';
import { VIDEO_CALL_GREETING } from '#/ai/prompts/voice-mode';
import { ensureChat } from '#/db/chat';
import { insertActiveCall } from '#/db/video-calls';
import { env } from '#/env';
import { auth } from '#/lib/auth';
import { createConversation, endConversation } from '#/lib/tavus.server';
import { tavusWebhookToken } from '#/lib/tavus-webhook-token.server';
import {
  type StartResponse,
  startRequestSchema,
} from '#/lib/video-call-contract';
import { loadAllowance } from '#/lib/video-call-service.server';

/**
 * Starts a Tavus video call. Order matters: every refusal (not configured,
 * live call elsewhere, daily limit) happens before Tavus is asked for a
 * conversation, and the chat row is only created once Tavus has said yes,
 * so a refusal leaves nothing behind. The unique active-call index is the
 * race guard: if a parallel start wins, this one ends its Tavus call and 409s.
 */
export async function startVideoCallHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is a valid start with no chat or course in context.
  }
  const parsed = startRequestSchema.safeParse(body ?? {});
  if (!parsed.success)
    return Response.json({ error: 'Invalid request' }, { status: 400 });

  const personaId = env.TAVUS_PERSONA_ID;
  if (!personaId)
    return Response.json({ reason: 'not_configured' }, { status: 503 });

  const userId = session.user.id;
  const now = new Date();
  const { allowance, activeCall } = await loadAllowance(userId, now);
  if (activeCall)
    return Response.json({ reason: 'already_active' }, { status: 409 });
  if (!allowance.canStart) {
    return Response.json(
      { reason: 'daily_limit', resetsAt: allowance.resetsAt.toISOString() },
      { status: 403 },
    );
  }

  const reservedSeconds = allowance.reservedSecondsIfStarted;
  let conversation: { conversationId: string; conversationUrl: string };
  try {
    conversation = await createConversation({
      personaId,
      callbackUrl: `${env.TAVUS_PUBLIC_URL}/api/tavus/webhook?token=${tavusWebhookToken()}`,
      maxCallDurationSeconds: reservedSeconds,
      customGreeting: VIDEO_CALL_GREETING,
    });
  } catch (err) {
    console.error('tavus create conversation failed', err);
    return Response.json({ reason: 'provider_unavailable' }, { status: 502 });
  }

  const endOrphan = () =>
    endConversation(conversation.conversationId).catch((err) =>
      console.error('tavus end orphaned conversation failed', err),
    );

  // Tavus is already running (and billing) a conversation: any failure from
  // here on must end it, or it runs with no row to count it against the day.
  let chatId: string;
  let inserted: Awaited<ReturnType<typeof insertActiveCall>>;
  try {
    chatId = await ensureChat({
      chatId: parsed.data.chatId,
      userId,
      firstUserText: 'Video call with Viper7',
    });
    inserted = await insertActiveCall({
      userId,
      userName: session.user.name ?? null,
      chatId,
      courseSlug: parsed.data.courseSlug ?? null,
      tavusConversationId: conversation.conversationId,
      reservedSeconds,
    });
  } catch (err) {
    console.error('video call persist failed after tavus create', err);
    await endOrphan();
    return Response.json({ reason: 'provider_unavailable' }, { status: 502 });
  }
  if (inserted === 'already_active') {
    await endOrphan();
    return Response.json({ reason: 'already_active' }, { status: 409 });
  }

  const response: StartResponse = {
    id: inserted.id,
    chatId,
    conversationUrl: conversation.conversationUrl,
    endsAt: addSeconds(inserted.startedAt, reservedSeconds).toISOString(),
  };
  return Response.json(response);
}

export const Route = createFileRoute('/api/video-call')({
  server: {
    handlers: { POST: ({ request }) => startVideoCallHandler(request) },
  },
});
