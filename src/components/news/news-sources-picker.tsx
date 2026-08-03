import { Switch } from '@base-ui/react/switch';
import type { NewsSourceChoice } from '#/lib/news-schemas';

interface NewsSourcesPickerProps {
  sources: readonly NewsSourceChoice[];
  onToggle: (sourceId: number, muted: boolean) => void;
  /** Ids with a write in flight, so their switch reads as busy. */
  pendingIds: readonly number[];
}

/**
 * Which publications this student sees.
 *
 * Just the list — the disclosure that wraps it lives in `NewsMasthead`, so the
 * expanded panel is a sibling of the dateline row rather than a flex item
 * inside it.
 *
 * The switch reads as "shown", not "muted": a control labelled with the
 * source's name should be on when that source is visible. Storing the inverse
 * is an implementation detail of the exclusion model and does not belong in
 * front of a reader.
 */
export const NewsSourcesPicker = ({
  sources,
  onToggle,
  pendingIds,
}: NewsSourcesPickerProps) => (
  <ul className="grid list-none grid-cols-1 gap-x-8 gap-y-1 border-gray-6 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">
    {sources.map((source) => {
      const pending = pendingIds.includes(source.id);
      return (
        <li
          key={source.id}
          className="flex items-center justify-between gap-3 py-1"
        >
          <label
            htmlFor={`news-source-${source.id}`}
            className="min-w-0 truncate font-sans text-primary text-sm"
          >
            {source.name}
          </label>
          <Switch.Root
            id={`news-source-${source.id}`}
            checked={!source.muted}
            disabled={pending}
            onCheckedChange={(checked) => onToggle(source.id, !checked)}
            className="relative h-5 w-9 shrink-0 rounded-full bg-gray-6 transition-colors data-[checked]:bg-accent-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-gray-1 transition-transform data-[checked]:translate-x-[1.125rem]" />
          </Switch.Root>
        </li>
      );
    })}
  </ul>
);
