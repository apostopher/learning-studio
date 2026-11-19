import { useAtom } from 'jotai';
import { selectedSessionIdAtom, sessionsPageAtom } from '#/atoms/admin';
import {
  useViperSession,
  useViperSessions,
} from '#/data-hooks/use-viper-sessions';
import { transcriptItems } from './session-labels';
import {
  SessionTranscript,
  type SessionTranscriptStatus,
} from './session-transcript';
import { SessionsList } from './sessions-list';

/**
 * The AI Training tab's Sessions section: learners' Viper chats, newest
 * first, with the chosen one's transcript beside the list.
 *
 * Admin-only (the tab is gated, and both endpoints guard) and read-only:
 * these are learners' private conversations, so there is no delete or
 * export.
 */
export const SessionsSectionContainer = () => {
  const [page, setPage] = useAtom(sessionsPageAtom);
  const [selectedId, setSelectedId] = useAtom(selectedSessionIdAtom);
  const sessions = useViperSessions(page);
  const session = useViperSession(selectedId);

  // While a new page loads the previous one stays on screen; paging again
  // before it lands would skip a page the admin never saw.
  const paging = sessions.isPlaceholderData;
  const previousDisabledReason = paging
    ? 'Loading conversations'
    : page === 0
      ? 'No newer conversations'
      : null;
  const nextDisabledReason = paging
    ? 'Loading conversations'
    : sessions.data?.hasMore
      ? null
      : 'No older conversations';

  const transcriptStatus: SessionTranscriptStatus =
    selectedId === null
      ? 'none'
      : session.isPending
        ? 'loading'
        : session.isError
          ? 'error'
          : session.data === null
            ? 'missing'
            : 'ready';

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <SessionsList
        sessions={sessions.data?.sessions ?? []}
        isLoading={sessions.isPending}
        error={sessions.isError ? "Couldn't load conversations." : null}
        onRetry={() => void sessions.refetch()}
        selectedId={selectedId}
        onSelect={setSelectedId}
        page={page}
        previousDisabledReason={previousDisabledReason}
        nextDisabledReason={nextDisabledReason}
        onPrevious={() => setPage((p) => Math.max(0, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
      <SessionTranscript
        status={transcriptStatus}
        summary={session.data?.summary ?? null}
        items={session.data ? transcriptItems(session.data.messages) : []}
        error={session.isError ? "Couldn't load this conversation." : null}
        onRetry={() => void session.refetch()}
      />
    </div>
  );
};
