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
