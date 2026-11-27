import { format, parseISO } from 'date-fns';

type OfferingWindow = { startsOn: string; endsOn: string };

/**
 * Which of the viewer's offerings of a course its header names, when they are
 * on more than one (a course runs several times a year): the one running
 * today; else the next to start; else the latest to have started. Dates are
 * `YYYY-MM-DD`, so they compare as strings. Null when they are on none.
 */
export function pickViewerOffering<O extends OfferingWindow>(
  offerings: readonly O[],
  today: string,
): O | null {
  const byStart = [...offerings].sort((a, b) =>
    a.startsOn.localeCompare(b.startsOn),
  );
  const running = byStart.filter(
    (o) => o.startsOn <= today && today <= o.endsOn,
  );
  if (running.length > 0) return running[running.length - 1];
  const upcoming = byStart.find((o) => o.startsOn > today);
  if (upcoming) return upcoming;
  return byStart[byStart.length - 1] ?? null;
}

/** "November 2026", for an offering starting on `startsOn`. */
export function offeringMonthLabel(startsOn: string): string {
  return format(parseISO(startsOn), 'MMMM yyyy');
}
