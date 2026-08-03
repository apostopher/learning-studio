interface NewsKickerProps {
  sourceName: string;
  /** Already formatted — "3 hours ago" or "Added 6 Aug". */
  timeLabel: string;
  alsoCoveredBy: readonly { id: number; name: string }[];
}

/**
 * The line above a headline: who ran it and when.
 *
 * Inter, uppercase, small — the one place on this page that is deliberately
 * NOT the serif. In print this is the slug line, and its job is to be
 * skippable; matching the headline's face would make it compete.
 *
 * `alsoCoveredBy` only ever contains sources this student can see — the API
 * filters it — so it cannot name something they muted.
 */
export const NewsKicker = ({
  sourceName,
  timeLabel,
  alsoCoveredBy,
}: NewsKickerProps) => (
  <p className="flex flex-wrap items-baseline gap-x-2 font-sans text-[0.6875rem] uppercase tracking-[0.12em]">
    <span className="font-semibold text-primary">{sourceName}</span>
    <span aria-hidden="true" className="text-gray-7">
      /
    </span>
    <span className="text-tertiary normal-case tracking-normal">
      {timeLabel}
    </span>
    {alsoCoveredBy.length > 0 && (
      <span className="basis-full text-tertiary normal-case tracking-normal">
        Also covered by {alsoCoveredBy.map((source) => source.name).join(', ')}
      </span>
    )}
  </p>
);
