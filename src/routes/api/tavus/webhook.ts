import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getCallByConversation } from '#/db/video-calls';
import { secretMatches } from '#/lib/secret-matches.server';
import { tavusWebhookToken } from '#/lib/tavus-webhook-token.server';
import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';

const RECONCILE_EVENTS = new Set([
  'system.shutdown',
  'application.transcription_ready',
]);
const webhookSchema = z.object({
  conversation_id: z.string(),
  event_type: z.string(),
});

/**
 * Tavus `callback_url`. The body is only trusted for the conversation id:
 * reconcileVideoCall fetches the real state from Tavus's API with our key.
 * Always 200 for anything authenticated, so Tavus doesn't retry noise.
 */
export async function tavusWebhookHandler(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!secretMatches(token, tavusWebhookToken())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const parsed = webhookSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success || !RECONCILE_EVENTS.has(parsed.data.event_type)) {
    return new Response(null, { status: 200 });
  }

  const call = await getCallByConversation(parsed.data.conversation_id);
  if (call) {
    await reconcileVideoCall(call).catch((err) =>
      console.error('tavus webhook reconcile failed', err),
    );
  }
  return new Response(null, { status: 200 });
}

export const Route = createFileRoute('/api/tavus/webhook')({
  server: { handlers: { POST: ({ request }) => tavusWebhookHandler(request) } },
});
