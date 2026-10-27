import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/**
 * A debrief time as the pilot reads it, in their own timezone: "Tue 28 Oct,
 * 3:40 PM", with " 2027" appended when the year is not the current one (in
 * that zone — on 31 Dec in UTC it may already be next year for the pilot).
 *
 * There is no stored user timezone, so it defaults to the browser's. That is
 * why every caller renders this inside `ClientGate`: on the server it would
 * format in the server's zone and mismatch on hydration.
 */
export function formatDebriefTime(
  iso: string,
  now: Date,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const at = new TZDate(iso, timeZone);
  const today = new TZDate(now, timeZone);
  const base = format(at, 'EEE d MMM, h:mm a');
  return at.getFullYear() === today.getFullYear()
    ? base
    : `${base} ${format(at, 'yyyy')}`;
}
