import type { UIMessage } from 'ai';
import { z } from 'zod';
import type { VideoCallEndReason } from '#/lib/video-call-contract';
import { callEndedLabel } from '#/lib/video-call-copy';

/**
 * Interpreting what Tavus sends us. Shapes come from the 2026-10-06 spike —
 * see the spec's "Spike findings".
 */

/** The Tavus persona's `system_prompt` (set by tavus-sync-persona). Tavus
 * puts it first in the first system message; we drop it and use our own. */
export const PERSONA_SENTINEL = '[[VIPER7_PERSONA_PROMPT]]';

/** Tavus validates a custom LLM with this placeholder conversation id. */
export const TAVUS_CONFIG_CHECK_ID = 'tavus-openai-compat-test';

// `\b` so a tag with attributes (`<user_emotions confidence="…">`) matches.
const PERCEPTION_TAG_RE = /<user_(?:appearance|emotions|screen)\b/;
// A tag must start with a letter, so "a < b" survives.
const SSML_TAG_RE = /<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>/g;

const contentPartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});
export const openAIChatMessageSchema = z.object({
  role: z.string(),
  content: z
    .union([z.string(), z.array(contentPartSchema), z.null()])
    .optional(),
});
export type OpenAIChatMessage = z.infer<typeof openAIChatMessageSchema>;

export const tavusCompletionRequestSchema = z.object({
  messages: z.array(openAIChatMessageSchema),
});

function contentText(content: OpenAIChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => p.text ?? '').join('');
  return '';
}

/**
 * Splits a Tavus completions request into Tavus's own rules (speech style,
 * mandatory emotion tags, date/time — kept) and the call's turns. Perception
 * messages (the learner's appearance, guessed ethnicity, emotions) are
 * dropped here so they never reach the model, logs or the database.
 */
export function splitTavusMessages(messages: OpenAIChatMessage[]): {
  tavusRules: string;
  history: UIMessage[];
} {
  const rules: string[] = [];
  const history: UIMessage[] = [];

  messages.forEach((message, index) => {
    const text = contentText(message.content);
    // Perception is dropped whatever role Tavus files it under.
    if (PERCEPTION_TAG_RE.test(text)) return;
    if (message.role === 'system' || message.role === 'developer') {
      const kept = text
        .split('\n')
        .filter((line) => line.trim() !== PERSONA_SENTINEL)
        .join('\n')
        .trim();
      if (kept) rules.push(kept);
      return;
    }
    if (
      (message.role === 'user' || message.role === 'assistant') &&
      text.trim()
    ) {
      history.push({
        id: `tavus-${index}`,
        role: message.role,
        parts: [{ type: 'text', text }],
      });
    }
  });

  return { tavusRules: rules.join('\n\n'), history };
}

export function stripSsml(text: string): string {
  return text.replace(SSML_TAG_RE, ' ').replace(/\s+/g, ' ').trim();
}

function statusLine(text: string) {
  return {
    role: 'assistant' as const,
    parts: [{ type: 'data-notification', data: { text } }] as unknown[],
  };
}

/**
 * Tavus's final transcript → messages to append to the chat. Bracketed by
 * two `data-notification` status lines, which the chat widget already renders
 * as muted text (ai_messages has no metadata column to mark them otherwise).
 */
export function transcriptToMessages(
  transcript: Array<{ role: string; content: string }>,
  summary: {
    durationSeconds: number | null;
    endReason: VideoCallEndReason | null;
  },
): Array<{ role: 'user' | 'assistant'; parts: unknown[] }> {
  const turns: Array<{ role: 'user' | 'assistant'; parts: unknown[] }> =
    transcript.flatMap((turn) => {
      const role =
        turn.role === 'user'
          ? 'user'
          : turn.role === 'assistant'
            ? 'assistant'
            : null;
      if (!role) return [];
      const text =
        role === 'assistant' ? stripSsml(turn.content) : turn.content.trim();
      return text
        ? [{ role, parts: [{ type: 'text', text }] as unknown[] }]
        : [];
    });

  return [
    statusLine('Video call with Viper7'),
    ...turns,
    statusLine(callEndedLabel(summary.durationSeconds, summary.endReason)),
  ];
}

export function mapShutdownReason(
  reason: string | undefined,
): VideoCallEndReason {
  if (!reason) return 'user';
  if (reason.includes('max_call_duration')) return 'time_limit';
  if (/participant_(?:left|absent)/.test(reason)) return 'left';
  return 'user';
}
