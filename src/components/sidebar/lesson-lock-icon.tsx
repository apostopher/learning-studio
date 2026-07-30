import { Lock } from 'lucide-react';

/**
 * The lock marker on a sidebar row — decoration only.
 *
 * Deliberately `aria-hidden` and prop-less. The reason a row is locked is
 * already a visible full sentence next to the lesson name (see LessonLink),
 * and both sit inside the same `<Link>`, so giving this icon a `title` or
 * `aria-label` made the accessible name announce the reason twice: "Pitch and
 * roll Finish Intro first Finish Intro first". The visible text is the
 * accessible name; the icon adds nothing a screen reader needs.
 *
 * Presentational and hookless (see Global Constraints).
 */
export const LessonLockIcon = () => (
  <span className="shrink-0 text-tertiary" aria-hidden="true">
    <Lock className="size-3.5" />
  </span>
);
