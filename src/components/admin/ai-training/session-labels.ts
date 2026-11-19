import { format } from 'date-fns';
import type { SessionMessage } from '#/lib/viper-session-schemas';

/** What a learner with no name on their profile is called. */
export const UNNAMED_LEARNER = 'Unnamed learner';

export const learnerLabel = (name: string | null): string =>
  name ?? UNNAMED_LEARNER;

export const messageCountLabel = (count: number): string =>
  `${count} ${count === 1 ? 'message' : 'messages'}`;

/** e.g. "19 Nov 2026, 8:30 AM", in the reader's time zone. */
export const sessionTimeLabel = (at: Date): string =>
  format(at, 'd MMM yyyy, h:mm a');

/** One bubble of a transcript, flattened from a stored message. */
export interface TranscriptItem {
  key: string;
  role: 'user' | 'assistant';
  text: string;
}

const isTextPart = (part: unknown): part is { type: 'text'; text: string } =>
  typeof part === 'object' &&
  part !== null &&
  (part as { type?: unknown }).type === 'text' &&
  typeof (part as { text?: unknown }).text === 'string';

/**
 * The readable part of a stored conversation: each user or Viper message's
 * text parts, joined. Tool calls, step markers and other non-text parts are
 * plumbing, not conversation, and are left out; so are system messages and
 * any message left with no text.
 */
export function transcriptItems(messages: SessionMessage[]): TranscriptItem[] {
  return messages.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return [];
    const text = message.parts
      .filter(isTextPart)
      .map((part) => part.text)
      .join('\n\n')
      .trim();
    return text ? [{ key: message.id, role: message.role, text }] : [];
  });
}
