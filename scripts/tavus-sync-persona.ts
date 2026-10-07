/**
 * Creates or updates this environment's Tavus persona so its custom-LLM
 * layer points at our completions endpoint.
 *
 *   pnpm tavus:sync-persona
 *
 * Needs TAVUS_API_KEY, TAVUS_REPLICA_ID, TAVUS_LLM_SECRET, TAVUS_PUBLIC_URL.
 * Without TAVUS_PERSONA_ID it creates a persona and prints the id to add to
 * .env.local; with it, it updates that persona in place.
 *
 * Tavus probes the endpoint on create/update (conversation id
 * `tavus-openai-compat-test`), so the app must be reachable at
 * TAVUS_PUBLIC_URL when this runs (dev: `pnpm dev` + ngrok).
 */
import { z } from 'zod';
import { PERSONA_SENTINEL } from '#/lib/tavus-messages';

const cfg = z
  .object({
    TAVUS_API_KEY: z.string().min(1),
    TAVUS_REPLICA_ID: z.string().regex(/^r[0-9a-z]+$/),
    TAVUS_LLM_SECRET: z.string().min(32),
    TAVUS_PUBLIC_URL: z.url(),
    TAVUS_PERSONA_ID: z.string().regex(/^p[0-9a-z]+$/).optional(),
  })
  .parse(process.env);

const publicUrl = cfg.TAVUS_PUBLIC_URL.replace(/\/$/, '');
const llm = {
  model: 'viper7',
  base_url: `${publicUrl}/api/tavus/v1`,
  api_key: cfg.TAVUS_LLM_SECRET,
  speculative_inference: true,
};

function redact(text: string): string {
  // split/join, not RegExp: a secret may contain regex metacharacters.
  let result = text.split(cfg.TAVUS_LLM_SECRET).join('[redacted]');
  result = result.split(cfg.TAVUS_API_KEY).join('[redacted]');
  return result.length > 500 ? result.slice(0, 500) + '…' : result;
}

async function tavus(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`https://tavusapi.com/v2${path}`, {
    ...init,
    headers: { 'x-api-key': cfg.TAVUS_API_KEY, 'content-type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok && res.status !== 304) {
    throw new Error(`Tavus ${init.method} ${path} → ${res.status}: ${redact(text)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Tavus ${init.method} ${path} returned non-JSON: ${redact(text)}`);
  }
}

async function main(): Promise<void> {
  if (cfg.TAVUS_PERSONA_ID) {
    // Tavus PATCH /personas takes a JSON Patch document.
    await tavus(`/personas/${cfg.TAVUS_PERSONA_ID}`, {
      method: 'PATCH',
      body: JSON.stringify([
        { op: 'replace', path: '/system_prompt', value: PERSONA_SENTINEL },
        { op: 'replace', path: '/default_replica_id', value: cfg.TAVUS_REPLICA_ID },
        { op: 'add', path: '/layers/llm', value: llm },
      ]),
    });
    console.info(`Updated persona ${cfg.TAVUS_PERSONA_ID} → ${llm.base_url}`);
    return;
  }

  const created = z.object({ persona_id: z.string() }).parse(
    await tavus('/personas', {
      method: 'POST',
      body: JSON.stringify({
        persona_name: `Viper7 (${new URL(publicUrl).host})`,
        system_prompt: PERSONA_SENTINEL,
        pipeline_mode: 'full',
        default_replica_id: cfg.TAVUS_REPLICA_ID,
        layers: { llm },
      }),
    }),
  );
  console.info(`Created persona. Add to .env.local:\nTAVUS_PERSONA_ID=${created.persona_id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
