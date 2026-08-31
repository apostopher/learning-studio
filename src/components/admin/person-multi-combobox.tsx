import { Combobox } from '@base-ui/react/combobox';
import { Check, X } from 'lucide-react';
import type { DisciplineExpertPick } from '#/lib/discipline-schemas';

export interface PersonMultiComboboxProps {
  /** The input's id, so a `<label htmlFor>` can point at it. */
  id: string;
  /** People already picked, rendered as removable chips. */
  value: DisciplineExpertPick[];
  onValueChange: (next: DisciplineExpertPick[]) => void;
  /** The current search's results — already filtered by the server. */
  options: DisciplineExpertPick[];
  query: string;
  onQueryChange: (query: string) => void;
  /** What the list says when it has nothing to offer, and why. */
  emptyLabel: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * A people picker that holds several people at once: type to search, pick from
 * the list, and each pick becomes a chip you can remove.
 *
 * Pure and hookless — every piece of state is the caller's, which is why the
 * search term is a controlled prop rather than Base UI's own input state. The
 * component that owns it is `DisciplineExpertPickerContainer`.
 *
 * `filter={null}` because the list is already the answer to `query`: the
 * search ran on the server against stored names and emails, and filtering the
 * results again here against the rendered label would drop anyone whose match
 * was on a field the label does not show.
 *
 * Values are `{ userId, label }` objects rather than bare ids, so a chip can
 * still name a person after the search that found them has been typed over.
 * `isItemEqualToValue` therefore compares ids — two objects for the same
 * person are the same selection.
 */
export const PersonMultiCombobox = ({
  id,
  value,
  onValueChange,
  options,
  query,
  onQueryChange,
  emptyLabel,
  placeholder = 'Search by name or email',
  disabled = false,
}: PersonMultiComboboxProps) => (
  <Combobox.Root
    multiple
    items={options}
    value={value}
    onValueChange={onValueChange}
    itemToStringLabel={(person: DisciplineExpertPick) => person.label}
    isItemEqualToValue={(a: DisciplineExpertPick, b: DisciplineExpertPick) =>
      a.userId === b.userId
    }
    filter={null}
    inputValue={query}
    onInputValueChange={onQueryChange}
    disabled={disabled}
  >
    <Combobox.InputGroup>
      <Combobox.Chips className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border border-gray-6 bg-gray-1 px-2 py-1.5 transition-colors duration-100 hover:border-gray-8 focus-within:border-apple-9 focus-within:ring-2 focus-within:ring-apple-9 data-disabled:opacity-60">
        <Combobox.Value>
          {(picked: DisciplineExpertPick[]) => (
            <>
              {picked.map((person) => (
                <Combobox.Chip
                  key={person.userId}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-4 py-0.5 ps-2 pe-1 text-primary text-xs"
                >
                  {person.label}
                  <Combobox.ChipRemove
                    // Named per person, not "Remove": a row of identical
                    // buttons tells a screen-reader user nothing about which
                    // expert they are about to drop.
                    aria-label={`Remove ${person.label}`}
                    className="rounded p-0.5 text-secondary transition-colors hover:bg-gray-6 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </Combobox.ChipRemove>
                </Combobox.Chip>
              ))}
              <Combobox.Input
                id={id}
                placeholder={picked.length === 0 ? placeholder : undefined}
                className="min-w-32 flex-1 bg-transparent px-1.5 py-1 text-primary text-sm outline-none placeholder:text-gray-9"
              />
            </>
          )}
        </Combobox.Value>
      </Combobox.Chips>
    </Combobox.InputGroup>
    <Combobox.Portal>
      <Combobox.Positioner sideOffset={4} className="z-50">
        <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-md border border-gray-6 bg-gray-2 py-1 shadow-lg">
          <Combobox.Empty className="px-3 py-2 text-secondary text-sm">
            {emptyLabel}
          </Combobox.Empty>
          <Combobox.List>
            {(person: DisciplineExpertPick) => (
              <Combobox.Item
                key={person.userId}
                value={person}
                className="flex cursor-default items-center gap-2 px-3 py-2 text-primary text-sm data-highlighted:bg-gray-4"
              >
                <Combobox.ItemIndicator>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </Combobox.ItemIndicator>
                <span>{person.label}</span>
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  </Combobox.Root>
);
