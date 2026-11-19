import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  type SessionsPage,
  type SessionTranscript,
  sessionsPageSchema,
  sessionTranscriptSchema,
} from '#/lib/viper-session-schemas';
import { dataKeys } from './keys';

/**
 * One page of learners' Viper chats. The previous page stays on screen while
 * the next loads, so paging does not flash an empty list.
 */
export function useViperSessions(page: number) {
  return useQuery({
    queryKey: dataKeys.viperSessions(page),
    queryFn: async (): Promise<SessionsPage> => {
      const res = await fetch(`/api/admin/viper/sessions?page=${page}`);
      if (!res.ok) {
        throw new Error(`Failed to load conversations (${res.status})`);
      }
      return sessionsPageSchema.parse(await res.json());
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/**
 * One chat's transcript, or nothing until a chat is chosen. Resolves `null`
 * when the chat no longer exists (the learner's account was deleted since the
 * list loaded), so that reads as gone rather than as a failure to retry.
 */
export function useViperSession(chatId: string | null) {
  return useQuery({
    queryKey: dataKeys.viperSession(chatId),
    queryFn: async (): Promise<SessionTranscript | null> => {
      const res = await fetch(
        `/api/admin/viper/sessions/${encodeURIComponent(chatId ?? '')}`,
      );
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Failed to load the conversation (${res.status})`);
      }
      return sessionTranscriptSchema.parse(await res.json());
    },
    enabled: chatId !== null,
    staleTime: 30_000,
  });
}
