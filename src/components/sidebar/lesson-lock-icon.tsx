import { Lock } from 'lucide-react';

type LessonLockIconProps = {
  /** Why the lesson is locked — becomes the accessible name. */
  reason: string;
};

/**
 * The lock marker on a sidebar row. `reason` is a full sentence, not
 * "Locked": the reason must be available to a screen reader and must not be
 * hover-only, so it also renders as visible text next to the lesson name
 * (see LessonLink) — this icon alone is not the fix, the text is.
 *
 * Presentational and hookless (see Global Constraints) — takes props only.
 */
export const LessonLockIcon = ({ reason }: LessonLockIconProps) => (
  <span
    className="shrink-0 text-tertiary"
    title={reason}
    aria-label={reason}
    role="img"
  >
    <Lock className="size-3.5" aria-hidden="true" />
  </span>
);
