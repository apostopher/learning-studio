import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

/**
 * The dense uppercase chip used to state one fact about a lesson on the board.
 *
 * Why this exists: eight different inline badge class-strings had accumulated
 * across the codebase (the Draft badge, the users table's role pills, the
 * persona list, the score badges) with no shared primitive. A row of chips only
 * reads as a row if they agree on height, radius, tracking and type — so the
 * agreement lives here rather than in each caller.
 *
 * Every tone pairs a background with its matching `-contrast` or `-text` token,
 * so light and dark both hold without either being special-cased.
 */
export type ChipTone =
  | 'muted'
  | 'solid-warning'
  | 'solid-success'
  | 'soft-warning'
  | 'soft-success'
  | 'soft-apple';

const TONE_CLASSES: Record<ChipTone, string> = {
  /** An unset or off state. Reads as present-but-inactive, not disabled. */
  muted: 'bg-gray-4 text-tertiary',
  /** A set state that wants to be noticed at a glance. */
  'solid-warning': 'bg-warning-9 text-warning-contrast',
  'solid-success': 'bg-success-9 text-success-contrast',
  /** A set state that should sit quieter than its solid sibling. */
  'soft-warning': 'bg-warning-3 text-warning-text',
  'soft-success': 'bg-success-3 text-success-text',
  /**
   * A cross-reference, not a status — e.g. "this lesson is also in 2 other
   * courses." Lives in `apple` (this codebase's navy brand hue), deliberately
   * apart from the warning/success tones above, which state something about
   * *this* entity rather than pointing at others.
   */
  'soft-apple': 'bg-apple-3 text-apple-text',
};

/**
 * The shared shape, exported so an interactive trigger can wear it without
 * nesting a chip inside a button — Base UI's Trigger renders its own element,
 * and a button wrapping a span would give the row two focusable boxes.
 *
 * The `min-w` is what makes a row of chips look aligned. The labels are
 * different lengths (BASIC, INTER, EXPERT, FREE) and forcing them to match
 * character-for-character would mean picking worse words; padding to a common
 * box gets the same result without that cost.
 */
export function chipClassName(tone: ChipTone, className?: string): string {
  return cn(
    'inline-flex min-w-[3.25rem] shrink-0 items-center justify-center',
    // A chip states one word; wrapping it renders "BASI C" and breaks the row.
    'whitespace-nowrap',
    'rounded-sm px-1.5 py-0.5 font-mono text-h6 uppercase tracking-wider',
    TONE_CLASSES[tone],
    className,
  );
}

interface ChipProps {
  children: ReactNode;
  tone: ChipTone;
  className?: string;
}

export const Chip = ({ children, tone, className }: ChipProps) => (
  <span className={chipClassName(tone, className)}>{children}</span>
);
