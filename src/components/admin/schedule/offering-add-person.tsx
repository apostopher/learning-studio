import { Plus, Search } from 'lucide-react';
import { cn } from '#/lib/cn';
import type { OfferingUser } from '#/lib/offering-schemas';

/**
 * The search-and-add control above the roster table.
 *
 * A search box with an explicit Add button rather than a combobox that adds
 * on click, because the roster is a table and the two have to read as one
 * thing: you find a person, you see who you found, you add them. A combobox
 * would put the found person inside a popup that closes on selection, which
 * is a different interaction sitting on top of a table.
 *
 * Presentational: the search term, the results and what "add" does all belong
 * to the container.
 */
export const OfferingAddPerson = ({
  query,
  onQueryChange,
  results,
  selectedUserId,
  onSelect,
  onAdd,
  emptyLabel,
  disabled = false,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  /** Matches, already filtered and with anyone on the roster removed. */
  results: OfferingUser[];
  /** The row the Add button will act on, or null. */
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
  onAdd: () => void;
  /** Why the list is empty, in terms the reader can act on. */
  emptyLabel: string;
  disabled?: boolean;
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search
          className="-translate-y-1/2 pointer-events-none absolute inset-inline-start-3 top-1/2 h-4 w-4 text-tertiary"
          aria-hidden="true"
        />
        <input
          id="offering-person-search"
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search people by name or email"
          aria-label="Search people to add to this offering"
          className="w-full rounded-lg border border-gray-6 bg-gray-1 py-2.5 ps-9 pe-3 text-primary text-sm outline-none transition-colors hover:border-gray-8 focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
        />
      </div>
      <button
        type="button"
        onClick={onAdd}
        // Disabled until someone is picked, and the reason is on the button
        // itself rather than left to be inferred from it being grey.
        disabled={disabled || selectedUserId === null}
        title={
          selectedUserId === null
            ? 'Pick someone from the results first'
            : undefined
        }
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-apple-9 px-3.5 py-2.5 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add
      </button>
    </div>

    {query.trim() !== '' &&
      (results.length === 0 ? (
        <p className="px-1 text-secondary text-sm">{emptyLabel}</p>
      ) : (
        // Real radio inputs in a real fieldset, rather than buttons wearing
        // `role="radio"`. Exactly one result is armed for the Add button, and
        // native radios give that for free: one tab stop for the whole group,
        // arrow keys between rows, and a checked state assistive tech already
        // understands.
        <fieldset className="max-h-40 overflow-y-auto rounded-lg border border-gray-6">
          <legend className="sr-only">Search results</legend>
          {results.map((person) => (
            <label
              key={person.userId}
              className={cn(
                'flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-apple-9 has-[:focus-visible]:ring-inset',
                selectedUserId === person.userId
                  ? 'bg-apple-3'
                  : 'bg-gray-1 hover:bg-gray-2',
              )}
            >
              <input
                type="radio"
                name="offering-person"
                value={person.userId}
                checked={selectedUserId === person.userId}
                onChange={() => onSelect(person.userId)}
                disabled={disabled}
                // Visible, not `sr-only`. The row highlight alone is a weak
                // cue for which person the Add button is about to act on, and
                // colour is not something to make the only carrier of state.
                className="size-3.5 shrink-0 self-center accent-apple-9"
              />
              <span className="font-medium text-primary">{person.name}</span>
              <span className="truncate font-mono text-tertiary text-xs">
                {person.email}
              </span>
            </label>
          ))}
        </fieldset>
      ))}
  </div>
);
