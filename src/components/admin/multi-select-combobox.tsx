import { Combobox } from '@base-ui/react/combobox';
import { Check, X } from 'lucide-react';

export interface MultiSelectOption {
  /** Stable identity. Selection equality compares this, never the label. */
  value: string;
  label: string;
}

export interface MultiSelectComboboxProps {
  /** The input's id, so a `<label htmlFor>` can point at it. */
  id: string;
  /** Everything picked so far, rendered as removable chips. */
  value: MultiSelectOption[];
  onValueChange: (next: MultiSelectOption[]) => void;
  options: MultiSelectOption[];
  /** What the list says when it has nothing to offer, and why. */
  emptyLabel: string;
  /**
   * The search term, when the CALLER owns it — which it must whenever the
   * options come from a server search, since the request is keyed on it.
   * Omit for a list that is already complete and filters locally.
   */
  query?: string;
  onQueryChange?: (query: string) => void;
  /**
   * True when `options` is already the answer to `query`. Turns Base UI's own
   * filtering OFF: filtering server results again against the rendered label
   * would drop anyone whose match was on a field the label does not show.
   */
  serverFiltered?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Pick several things at once: type to narrow, click to select, and each pick
 * becomes a chip you can remove.
 *
 * Pure and hookless. One component for both pickers in the admin — people for
 * a discipline, and disciplines for a person — because they differ only in
 * WHERE the filtering happens, which `serverFiltered` says outright rather
 * than leaving two near-identical files to drift.
 *
 * `isItemEqualToValue` compares `value`, never the object, so a chip survives
 * the option list being rebuilt under it — which happens on every keystroke of
 * a server-backed search.
 */
export const MultiSelectCombobox = ({
  id,
  value,
  onValueChange,
  options,
  emptyLabel,
  query,
  onQueryChange,
  serverFiltered = false,
  placeholder = 'Search',
  disabled = false,
}: MultiSelectComboboxProps) => (
  <Combobox.Root
    multiple
    items={options}
    value={value}
    onValueChange={onValueChange}
    itemToStringLabel={(option: MultiSelectOption) => option.label}
    isItemEqualToValue={(a: MultiSelectOption, b: MultiSelectOption) =>
      a.value === b.value
    }
    filter={serverFiltered ? null : undefined}
    inputValue={query}
    onInputValueChange={onQueryChange}
    disabled={disabled}
  >
    <Combobox.InputGroup>
      <Combobox.Chips className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border border-gray-6 bg-gray-1 px-2 py-1.5 transition-colors duration-100 focus-within:border-apple-9 focus-within:ring-2 focus-within:ring-apple-9 hover:border-gray-8 data-disabled:opacity-60">
        <Combobox.Value>
          {(picked: MultiSelectOption[]) => (
            <>
              {picked.map((option) => (
                <Combobox.Chip
                  key={option.value}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-4 py-0.5 ps-2 pe-1 text-primary text-xs"
                >
                  {option.label}
                  <Combobox.ChipRemove
                    // Named per item, not "Remove": a row of identical buttons
                    // tells a screen-reader user nothing about which one they
                    // are about to drop.
                    aria-label={`Remove ${option.label}`}
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
            {(option: MultiSelectOption) => (
              <Combobox.Item
                key={option.value}
                value={option}
                className="flex cursor-default items-center gap-2 px-3 py-2 text-primary text-sm data-highlighted:bg-gray-4"
              >
                <Combobox.ItemIndicator>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </Combobox.ItemIndicator>
                <span>{option.label}</span>
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  </Combobox.Root>
);
