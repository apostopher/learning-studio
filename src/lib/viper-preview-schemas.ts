import type { UIMessage } from 'ai';
import { z } from 'zod';

/**
 * Most messages one preview request may carry (user and Viper turns
 * together). The preview keeps its history on the client, so this is what
 * bounds the body and the prompt; the Chat section stops accepting input once
 * a conversation reaches it and asks for a new chat.
 */
export const PREVIEW_MAX_MESSAGES = 40;

/** POST /api/admin/viper/preview. */
export const previewChatRequestSchema = z.object({
  personaId: z.number().int().positive(),
  lessonSlug: z.string().min(1),
  messages: z.array(z.unknown()).min(1).max(PREVIEW_MAX_MESSAGES),
});
export type PreviewChatRequest = z.infer<typeof previewChatRequestSchema>;

/**
 * Longest single user text part a preview request may carry, in characters —
 * the same bound the student chat puts on a learner turn.
 */
export const PREVIEW_MAX_USER_TEXT = 8000;

/**
 * Most characters of text, across every part of every message, one preview
 * request may carry. The client sends the whole conversation each turn and
 * all of it goes into the prompt, so the message count alone does not bound
 * the cost.
 */
export const PREVIEW_MAX_TOTAL_TEXT = 100_000;

/** The 400 the preview sends for a conversation it will not pass on. */
export const PREVIEW_TOO_LONG_ERROR =
  'This preview conversation is too long or contains unsupported content. Start a new chat.';

/**
 * Whether a validated conversation is small enough, and plain enough, to send
 * to the model. Refuses any `file` part (`convertToModelMessages` may
 * download its URL), a user text part over `PREVIEW_MAX_USER_TEXT`, and text
 * over `PREVIEW_MAX_TOTAL_TEXT` in all.
 */
export function previewMessagesWithinLimits(messages: UIMessage[]): boolean {
  let total = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'file') return false;
      if (part.type !== 'text') continue;
      if (message.role === 'user' && part.text.length > PREVIEW_MAX_USER_TEXT) {
        return false;
      }
      total += part.text.length;
      if (total > PREVIEW_MAX_TOTAL_TEXT) return false;
    }
  }
  return true;
}

/**
 * The conversation as the model will see it: each message's `text` parts
 * only, and no message left empty.
 *
 * Viper's own turns come back from `useChat` with `step-start`,
 * `tool-searchKB` (input and output), reasoning and data parts. Those are
 * client-supplied JSON that `convertToModelMessages` would carry into the
 * prompt, and the size caps count text only — so they are dropped rather than
 * refused (refusing them would fail every second turn). `buildChatStream`
 * prunes earlier turns' tool calls anyway, so the model loses nothing it used.
 */
export function previewTextOnly(messages: UIMessage[]): UIMessage[] {
  return messages.flatMap((message) => {
    const parts = message.parts.filter((part) => part.type === 'text');
    return parts.length === 0
      ? []
      : [{ id: message.id, role: message.role, parts }];
  });
}
