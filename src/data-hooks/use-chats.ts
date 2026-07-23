import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const chatSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  /** ISO timestamp — Date serializes to a string over JSON. */
  updatedAt: z.string(),
});

const chatListSchema = z.array(chatSummarySchema);

export type ChatSummary = z.infer<typeof chatSummarySchema>;

/**
 * The logged-in user's chats, most recently updated first — powers the chat
 * sidebar. Backed by GET /api/chats.
 */
export function useChats() {
  return useQuery({
    queryKey: dataKeys.chats(),
    queryFn: async () => {
      const res = await fetch('/api/chats');
      if (!res.ok) {
        throw new Error(`Failed to load chats (${res.status})`);
      }
      return chatListSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}
