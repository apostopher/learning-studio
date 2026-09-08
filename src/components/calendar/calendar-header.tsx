import { Button } from '@base-ui/react/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this folder's
// modules are imported directly by their tests.
import { cn } from '#/lib/cn';

const navButtonClassName =
  'inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-gray-6 bg-gray-1 px-2.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9';

/**
 * The bar above a `Calendar`: what is on screen, and the controls that move
 * the window.
 *
 * Callbacks only — the window itself lives in the consumer's atom, because
 * the same window has to be readable by whatever else is on the screen (the
 * rail of things being scheduled, a print view, a URL param). A header that
 * owned it would make itself the source of truth for state its siblings need.
 *
 * `stepLabel` names the size of a step in the button's accessible name.
 * "Previous"/"Next" alone leaves a keyboard user pressing a button with no
 * idea whether it moves a day, a week or a month.
 */
export const CalendarHeader = ({
  title,
  rangeLabel,
  stepLabel,
  onPrevious,
  onNext,
  onToday,
  actions,
  className,
}: {
  title: string;
  /** Which days are on screen — from `formatCalendarRange`. */
  rangeLabel: string;
  /** How far the arrows move, e.g. `'four weeks'`. */
  stepLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  /** Returns the window to the week containing today. */
  onToday: () => void;
  /** Extra controls for this particular calendar — print, a filter, a legend. */
  actions?: ReactNode;
  className?: string;
}) => (
  <header
    className={cn(
      'flex flex-wrap items-center gap-x-4 gap-y-2 border-gray-6 border-b bg-gray-2 px-4 py-3',
      className,
    )}
  >
    <h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
      {title}
    </h2>
    {/*
      A live region: the arrows change this caption and nothing else, so
      without it a screen reader user presses "Back four weeks" and hears
      nothing at all.
    */}
    <p aria-live="polite" className="font-mono text-secondary text-xs">
      {rangeLabel}
    </p>
    <div className="ms-auto flex items-center gap-2">
      {actions}
      <Button
        onClick={onPrevious}
        aria-label={`Back ${stepLabel}`}
        className={navButtonClassName}
      >
        {/* The chevron points at the start of the line, whichever side that
            is — the control moves backwards in reading order, not leftwards. */}
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      </Button>
      <Button onClick={onToday} className={navButtonClassName}>
        Today
      </Button>
      <Button
        onClick={onNext}
        aria-label={`On ${stepLabel}`}
        className={navButtonClassName}
      >
        <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      </Button>
    </div>
  </header>
);
