import { Button } from '@base-ui/react/button';
import { Video } from 'lucide-react';
import { ChatMessage } from '#/components/chat-widget/chat-message';
import { ScrollArea } from '#/components/scroll-area';
import { Chip } from '#/components/ui/chip';
import {
  learnerLabel,
  messageCountLabel,
  sessionTimeLabel,
  type TranscriptItem,
} from './session-labels';
import type { SessionListItem } from './sessions-list';

/**
 * - `none`: no conversation chosen yet.
 * - `missing`: the chosen one no longer exists.
 */
export type SessionTranscriptStatus =
  | 'none'
  | 'loading'
  | 'error'
  | 'missing'
  | 'ready';

interface SessionTranscriptProps {
  status: SessionTranscriptStatus;
  /** Present when `status` is `ready`. */
  summary: SessionListItem | null;
  items: TranscriptItem[];
  /** The load failure, as a sentence, when `status` is `error`. */
  error: string | null;
  onRetry: () => void;
}

const Note = ({ children }: { children: string }) => (
  <p className="py-12 text-center text-secondary text-sm">{children}</p>
);

/**
 * One learner's conversation with Viper, as they saw it: their messages and
 * Viper's replies, text only. Read-only.
 *
 * Hookless. The container fetches the chat and flattens it to `items`.
 */
export const SessionTranscript = ({
  status,
  summary,
  items,
  error,
  onRetry,
}: SessionTranscriptProps) => {
  const learner = learnerLabel(summary?.learnerName ?? null);

  return (
    <section
      aria-label="Transcript"
      className="flex flex-col gap-4 rounded-xl border border-gray-6 bg-gray-2 p-6"
    >
      {status === 'ready' && summary ? (
        <header className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 font-semibold text-lg text-primary">
              {summary.title}
            </h2>
            {summary.isVideoCall ? (
              <Chip tone="soft-apple" className="gap-1">
                <Video className="h-3 w-3" aria-hidden="true" />
                Video call
              </Chip>
            ) : null}
          </div>
          <p className="flex flex-wrap gap-x-2 text-secondary text-sm">
            <span>{learner}</span>
            <span aria-hidden="true">·</span>
            <span>
              Last active{' '}
              <time dateTime={summary.updatedAt.toISOString()}>
                {sessionTimeLabel(summary.updatedAt)}
              </time>
            </span>
            <span aria-hidden="true">·</span>
            <span>{messageCountLabel(summary.messageCount)}</span>
          </p>
        </header>
      ) : (
        <h2 className="font-semibold text-lg text-primary">Transcript</h2>
      )}

      {status === 'none' ? (
        <Note>Choose a conversation to read it.</Note>
      ) : status === 'loading' ? (
        <Note>Loading the conversation…</Note>
      ) : status === 'missing' ? (
        <Note>This conversation no longer exists.</Note>
      ) : status === 'error' ? (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg bg-error-3 px-3 py-2 text-error-text text-sm"
        >
          {error}
          <Button
            onClick={onRetry}
            className="rounded font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            Retry
          </Button>
        </p>
      ) : items.length === 0 ? (
        <Note>This conversation has no messages to show.</Note>
      ) : (
        <ScrollArea
          className="max-h-[70vh] rounded-lg border border-gray-6 bg-gray-1"
          viewportClassName="p-3"
        >
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ChatMessage
                key={item.key}
                text={item.text}
                role={item.role}
                userLabel={learner}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </section>
  );
};
