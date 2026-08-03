// `formatDistanceStrict`, not `formatDistanceToNowStrict`: the latter reads the
// wall clock internally, which ignores the injected `now` and makes every
// relative string here untestable.
import { differenceInHours, format, formatDistanceStrict } from 'date-fns';

/**
 * How one article's timestamp is written.
 *
 * The estimated case is the point of this module. `publishedAtEstimated` means
 * the article's page carried no usable date and the cron substituted when it
 * was discovered. Rendering that as "3 hours ago" would invent a precision
 * that does not exist — the flag was added specifically so the UI can decline
 * to. "Added 6 Aug" is true; "Published 3 hours ago" would not be.
 */
export function formatArticleTime(
  publishedAt: Date,
  estimated: boolean,
  now: Date = new Date(),
): string {
  if (estimated) return `Added ${format(publishedAt, 'd MMM')}`;

  // Relative only inside a day. Beyond that "5 days ago" is harder to place
  // than a date, and a daily reader mostly wants to know "is this new since
  // yesterday".
  const hours = Math.abs(differenceInHours(now, publishedAt));
  if (hours < 24) {
    return formatDistanceStrict(publishedAt, now, { addSuffix: true });
  }
  return format(publishedAt, 'd MMM');
}

/** The masthead's "Updated …" line, or null when nothing has ever been scraped. */
export function formatLastUpdated(
  lastUpdatedAt: Date | null,
  now: Date = new Date(),
): string | null {
  if (!lastUpdatedAt) return null;
  const hours = Math.abs(differenceInHours(now, lastUpdatedAt));
  if (hours < 1) return 'Updated just now';
  return `Updated ${formatDistanceStrict(lastUpdatedAt, now, { addSuffix: true })}`;
}

/** Long-form dateline, e.g. "Saturday, 8 August 2026". */
export function formatDateline(now: Date = new Date()): string {
  return format(now, 'EEEE, d MMMM yyyy');
}
