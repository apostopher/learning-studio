import { z } from 'zod';
import { env } from '#/env';

/**
 * Minimal Tavus REST client. Server-only: it carries TAVUS_API_KEY.
 * Request/response shapes were verified against the live API during the
 * 2026-10-06 spike (see the spec's "Spike findings").
 */

const TAVUS_API = 'https://tavusapi.com/v2';

export class TavusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TavusError';
  }
}

/** Every Tavus call sits on a learner's click or a webhook/reconcile path; a
 * hung request must fail fast rather than hold those open. */
const TAVUS_TIMEOUT_MS = 8000;

async function tavusFetch(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const label = `Tavus ${init.method ?? 'GET'} ${path}`;
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${TAVUS_API}${path}`, {
      ...init,
      headers: {
        'x-api-key': env.TAVUS_API_KEY,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(TAVUS_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    // Timeouts and network failures surface as TavusError, which every
    // caller already handles (start → 502; reconcile paths catch and retry).
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new TavusError(
      timedOut ? 504 : 502,
      `${label} → ${timedOut ? `timed out after ${TAVUS_TIMEOUT_MS} ms` : `failed: ${err instanceof Error ? err.message : String(err)}`}`,
    );
  }
  if (!res.ok) {
    throw new TavusError(
      res.status,
      `${label} → ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  return text ? (JSON.parse(text) as unknown) : null;
}

const createdSchema = z.object({
  conversation_id: z.string(),
  conversation_url: z.url(),
});

export async function createConversation(input: {
  personaId: string;
  callbackUrl: string;
  maxCallDurationSeconds: number;
  customGreeting: string;
}): Promise<{ conversationId: string; conversationUrl: string }> {
  const body = await tavusFetch('/conversations', {
    method: 'POST',
    body: JSON.stringify({
      persona_id: input.personaId,
      replica_id: env.TAVUS_REPLICA_ID,
      callback_url: input.callbackUrl,
      custom_greeting: input.customGreeting,
      properties: {
        max_call_duration: input.maxCallDurationSeconds,
        // End ~30 s after the learner leaves (closed tab), and give up if
        // they never join within 2 minutes.
        participant_left_timeout: 30,
        participant_absent_timeout: 120,
      },
    }),
  });
  const parsed = createdSchema.parse(body);
  return {
    conversationId: parsed.conversation_id,
    conversationUrl: parsed.conversation_url,
  };
}

/** Ending an already-ended conversation returns 200 (verified in the spike). */
export async function endConversation(conversationId: string): Promise<void> {
  await tavusFetch(`/conversations/${encodeURIComponent(conversationId)}/end`, {
    method: 'POST',
  });
}

const transcriptTurnSchema = z.object({
  role: z.string(),
  content: z.string(),
});
export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;

const conversationSchema = z.object({
  status: z.string(),
  events: z
    .array(
      z.object({
        event_type: z.string(),
        timestamp: z.string(),
        properties: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
});

export interface TavusConversation {
  status: string;
  shutdown: { at: Date; reason: string } | null;
  transcript: TranscriptTurn[] | null;
}

export async function getConversation(
  conversationId: string,
): Promise<TavusConversation> {
  const body = conversationSchema.parse(
    await tavusFetch(
      `/conversations/${encodeURIComponent(conversationId)}?verbose=true`,
    ),
  );
  const events = body.events ?? [];
  const shutdownEvent = events.find((e) => e.event_type === 'system.shutdown');
  const transcriptEvent = events.find(
    (e) => e.event_type === 'application.transcription_ready',
  );
  const transcript = z
    .array(transcriptTurnSchema)
    .safeParse(transcriptEvent?.properties?.transcript);

  return {
    status: body.status,
    shutdown: shutdownEvent
      ? {
          at: new Date(shutdownEvent.timestamp),
          reason: String(shutdownEvent.properties?.shutdown_reason ?? ''),
        }
      : null,
    transcript: transcript.success ? transcript.data : null,
  };
}
