import type { UIMessage } from 'ai';

/**
 * Safety net, not the budget: compaction keeps the unsummarized tail far
 * shorter than this. It only bites when compaction keeps failing, and then it
 * still bounds every request.
 */
export const HISTORY_HARD_CAP = 40;

export type HistoryEntry = { order: number; message: UIMessage };

/**
 * Stored rows → model history. Only learner/Viper turns: role is free text
 * written from client-sent messages, and a stored `system` row must never
 * replay as a system prompt.
 */
export function toHistoryEntries(
  rows: Array<{ id: string; role: string; parts: unknown; order: number }>,
): HistoryEntry[] {
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .sort((a, b) => a.order - b.order)
    .slice(-HISTORY_HARD_CAP)
    .map((r) => ({
      order: r.order,
      message: {
        id: r.id,
        role: r.role as 'user' | 'assistant',
        parts: r.parts as UIMessage['parts'],
      },
    }));
}
