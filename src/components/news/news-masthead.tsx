import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronDown } from 'lucide-react';
import type { NewsSourceChoice } from '#/lib/news-schemas';
import { NewsSourcesPicker } from './news-sources-picker';

interface NewsMastheadProps {
  /** The course name — this paper's title. Never a fabricated publication. */
  courseName: string;
  /** Long-form dateline, e.g. "Saturday, 8 August 2026". */
  dateline: string;
  /** "Updated 6 hours ago", or null when nothing has been scraped. */
  lastUpdatedLabel: string | null;
  sources: readonly NewsSourceChoice[];
  sourcesOpen: boolean;
  onSourcesOpenChange: (open: boolean) => void;
  onToggleSource: (sourceId: number, muted: boolean) => void;
  pendingSourceIds: readonly number[];
}

/**
 * The paper's nameplate: title, rules, dateline, and the sources disclosure.
 *
 * The only place Bebas Neue appears on this page. A masthead is supposed to
 * speak in a different voice from the page beneath it, and confining the
 * display face here keeps three typefaces from competing in the columns.
 *
 * `Collapsible.Root` wraps the meta ROW rather than sitting inside it. Nested
 * in the row, the expanded panel becomes a flex item and squeezes the dateline
 * and the "Updated" label into narrow columns beside the source list.
 */
export const NewsMasthead = ({
  courseName,
  dateline,
  lastUpdatedLabel,
  sources,
  sourcesOpen,
  onSourcesOpenChange,
  onToggleSource,
  pendingSourceIds,
}: NewsMastheadProps) => {
  const visibleCount = sources.filter((source) => !source.muted).length;

  return (
    <header className="border-gray-12 border-b-2 pb-3">
      <div className="border-gray-6 border-b pb-3 text-center">
        <h1 className="font-display text-4xl leading-none tracking-wide text-primary uppercase sm:text-6xl">
          {courseName}
        </h1>
      </div>

      <Collapsible.Root
        open={sourcesOpen}
        onOpenChange={onSourcesOpenChange}
        className="pt-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/*
            A dateline is two facts: today's date (the paper's identity) and
            how fresh the contents actually are. The second is the visible
            signal that the scraper has stopped — without it a stale feed and
            a quiet news week look identical.
          */}
          <p className="font-sans text-secondary text-xs uppercase tracking-widest">
            {dateline}
          </p>
          <div className="flex items-center gap-3">
            {lastUpdatedLabel && (
              <p className="font-sans text-tertiary text-xs">
                {lastUpdatedLabel}
              </p>
            )}
            {sources.length > 0 && (
              <Collapsible.Trigger className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-secondary text-xs transition-colors hover:bg-gray-3 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9">
                Showing {visibleCount} of {sources.length} sources
                <ChevronDown
                  className="h-3.5 w-3.5 transition-transform duration-200 group-data-[panel-open]:rotate-180"
                  aria-hidden="true"
                />
              </Collapsible.Trigger>
            )}
          </div>
        </div>

        <Collapsible.Panel className="mt-3">
          <NewsSourcesPicker
            sources={sources}
            onToggle={onToggleSource}
            pendingIds={pendingSourceIds}
          />
        </Collapsible.Panel>
      </Collapsible.Root>
    </header>
  );
};
