import { Newspaper } from 'lucide-react';
import type { NewsEmptyReason } from './compute-news-state';

interface NewsEmptyStateProps {
  reason: NewsEmptyReason;
  mutedCount: number;
  /** Only offered for `all-muted` — the one empty state a student can fix. */
  onShowAll?: () => void;
}

/**
 * Why there is nothing to read.
 *
 * Three different situations that all arrive as an empty article list, and
 * they call for opposite responses: one is an administrator's job, one is
 * patience, one is a setting this student changed. Collapsing them into "No
 * news available" would tell a student who muted everything that the system is
 * broken — and give them nothing to act on.
 */
export const NewsEmptyState = ({
  reason,
  mutedCount,
  onShowAll,
}: NewsEmptyStateProps) => {
  const copy = COPY[reason];

  return (
    <div className="flex flex-col items-center gap-3 border-gray-6 border-t px-6 py-16 text-center">
      <Newspaper className="h-8 w-8 text-tertiary" aria-hidden="true" />
      <h2 className="font-serif text-primary text-xl">{copy.title}</h2>
      <p className="max-w-prose font-sans text-secondary text-sm">
        {reason === 'all-muted'
          ? `You've hidden all ${mutedCount} sources for this course.`
          : copy.body}
      </p>
      {reason === 'all-muted' && onShowAll && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-2 rounded-lg bg-accent-9 px-4 py-2 font-sans font-medium text-accent-contrast text-sm transition-colors hover:bg-accent-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9 focus-visible:ring-offset-2"
        >
          Show all sources
        </button>
      )}
    </div>
  );
};

const COPY: Record<NewsEmptyReason, { title: string; body: string }> = {
  // Deliberately not "no news today": no feed is configured at all, and
  // implying we looked and found nothing would be untrue.
  'no-sources': {
    title: 'No news sources yet',
    body: 'No news sources have been set up for this course yet.',
  },
  'no-articles': {
    title: 'No stories yet',
    body: 'Nothing has come in from this course’s sources yet. This page updates each morning.',
  },
  // `body` is unused for this reason — the component substitutes a sentence
  // carrying the muted count, which is the fact that makes it actionable.
  'all-muted': {
    title: 'Every source is hidden',
    body: '',
  },
};
