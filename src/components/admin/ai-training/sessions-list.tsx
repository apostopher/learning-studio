import { Button } from '@base-ui/react/button';
import { ChevronLeft, ChevronRight, Video } from 'lucide-react';
import { Chip } from '#/components/ui/chip';
import { cn } from '#/lib/cn';
import {
  learnerLabel,
  messageCountLabel,
  sessionTimeLabel,
} from './session-labels';

export interface SessionListItem {
  id: string;
  title: string;
  learnerName: string | null;
  updatedAt: Date;
  messageCount: number;
  isVideoCall: boolean;
}

interface SessionsListProps {
  sessions: SessionListItem[];
  /** First load, before any page has arrived. */
  isLoading: boolean;
  /** The last load's failure, as a sentence. */
  error: string | null;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (chatId: string) => void;
  /** From 0, newest first. */
  page: number;
  /** Why Previous cannot be used, or null when it can. */
  previousDisabledReason: string | null;
  /** Why Next cannot be used, or null when it can. */
  nextDisabledReason: string | null;
  onPrevious: () => void;
  onNext: () => void;
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9';

// Off without opacity: faded text drops under AA. Secondary on gray-2 is a
// measured AA pair, so a disabled control stays legible.
const pagerButton = cn(
  'inline-flex items-center gap-1 rounded-lg border border-gray-6 bg-gray-1 px-3 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-gray-3',
  'data-[disabled]:cursor-not-allowed data-[disabled]:bg-gray-2 data-[disabled]:text-secondary data-[disabled]:hover:bg-gray-2',
  focusRing,
);

const PagerControl = ({
  label,
  reason,
  onClick,
  icon,
  align,
}: {
  label: string;
  reason: string | null;
  onClick: () => void;
  icon: 'previous' | 'next';
  align: 'start' | 'end';
}) => (
  <div
    className={cn(
      'flex flex-col gap-1',
      align === 'start' ? 'items-start' : 'items-end',
    )}
  >
    <Button
      onClick={onClick}
      disabled={reason !== null}
      // Stays in the tab order while off, so its reason can be heard.
      focusableWhenDisabled
      aria-label={reason ? `${label}: ${reason}` : label}
      className={pagerButton}
    >
      {icon === 'previous' ? (
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      ) : null}
      {label}
      {icon === 'next' ? (
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      ) : null}
    </Button>
    {reason ? (
      <span className="text-secondary text-xs" aria-hidden="true">
        {reason}
      </span>
    ) : null}
  </div>
);

/**
 * Learners' Viper chats, newest activity first, one page at a time. Choosing
 * one opens its transcript beside the list. Read-only: there is nothing here
 * to edit, delete or export.
 *
 * Hookless. `SessionsSectionContainer` owns the queries, the page and the
 * selection.
 */
export const SessionsList = ({
  sessions,
  isLoading,
  error,
  onRetry,
  selectedId,
  onSelect,
  page,
  previousDisabledReason,
  nextDisabledReason,
  onPrevious,
  onNext,
}: SessionsListProps) => (
  <section className="flex flex-col gap-4 rounded-xl border border-gray-6 bg-gray-2 p-6">
    <header className="flex flex-col gap-1">
      <h2 className="font-semibold text-lg text-primary">Conversations</h2>
      <p className="text-secondary text-sm">
        Learners' chats with Viper, most recent first. Read-only.
      </p>
    </header>

    {error ? (
      <p
        role="alert"
        className="flex flex-wrap items-center gap-2 rounded-lg bg-error-3 px-3 py-2 text-error-text text-sm"
      >
        {error}
        <Button
          onClick={onRetry}
          className={cn(
            'rounded font-medium underline underline-offset-2',
            focusRing,
          )}
        >
          Retry
        </Button>
      </p>
    ) : null}

    {isLoading ? (
      <p className="py-8 text-center text-secondary text-sm">
        Loading conversations…
      </p>
    ) : sessions.length === 0 ? (
      error ? null : (
        <p className="py-8 text-center text-secondary text-sm">
          No conversations yet.
        </p>
      )
    ) : (
      <ul className="flex flex-col gap-1">
        {sessions.map((session) => {
          const selected = session.id === selectedId;
          return (
            <li key={session.id}>
              <Button
                onClick={() => onSelect(session.id)}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-gray-3',
                  selected && 'bg-gray-4 hover:bg-gray-4',
                  focusRing,
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-primary text-sm">
                    {session.title}
                  </span>
                  {session.isVideoCall ? (
                    <Chip tone="soft-apple" className="gap-1">
                      <Video className="h-3 w-3" aria-hidden="true" />
                      Video call
                    </Chip>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-secondary text-xs">
                  <span>{learnerLabel(session.learnerName)}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={session.updatedAt.toISOString()}>
                    {sessionTimeLabel(session.updatedAt)}
                  </time>
                  <span aria-hidden="true">·</span>
                  <span>{messageCountLabel(session.messageCount)}</span>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    )}

    <nav
      aria-label="Conversation pages"
      className="flex items-start justify-between gap-4 border-gray-6 border-bs pbs-4"
    >
      <PagerControl
        label="Previous"
        reason={previousDisabledReason}
        onClick={onPrevious}
        icon="previous"
        align="start"
      />
      <span className="pbs-1.5 text-secondary text-sm">Page {page + 1}</span>
      <PagerControl
        label="Next"
        reason={nextDisabledReason}
        onClick={onNext}
        icon="next"
        align="end"
      />
    </nav>
  </section>
);
