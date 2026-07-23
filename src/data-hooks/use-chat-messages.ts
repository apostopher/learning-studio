import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const chatSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  /** ISO timestamps — Date serializes to a string over JSON. */
  createdAt: z.string(),
  updatedAt: z.string(),
});

const chatMessageSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  role: z.string(),
  /**
   * AI-SDK-shaped message parts. Deliberately left unconstrained here — the
   * exact part union is owned by the AI SDK, not this hook, and mirroring it
   * in zod would just drift out of sync.
   */
  parts: z.array(z.unknown()),
  order: z.number(),
  createdAt: z.string(),
});

const chatWithMessagesSchema = z.object({
  chat: chatSchema,
  messages: z.array(chatMessageSchema),
});

export type ChatWithMessages = z.infer<typeof chatWithMessagesSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * A single chat with its messages in order, for resuming a conversation.
 * Backed by GET /api/chats/:chatId. Disabled until `chatId` is non-empty.
 */
export function useChatMessages(chatId: string) {
  return useQuery({
    queryKey: dataKeys.chatMessages(chatId),
    queryFn: async () => {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
      if (!res.ok) {
        throw new Error(`Failed to load chat (${res.status})`);
      }
      return chatWithMessagesSchema.parse(await res.json());
    },
    enabled: chatId.length > 0,
    staleTime: 30_000,
  });
}
