import { createHmac } from 'node:crypto';
import { env } from '#/env';

/**
 * Token carried in the Tavus `callback_url` query string. Derived from the
 * LLM secret so it needs no extra env var, but is not the secret itself: the
 * URL ends up in logs and the Tavus dashboard, and the raw secret is also the
 * completions bearer key.
 */
export function tavusWebhookToken(): string {
  return createHmac('sha256', env.TAVUS_LLM_SECRET)
    .update('tavus-webhook')
    .digest('hex');
}
