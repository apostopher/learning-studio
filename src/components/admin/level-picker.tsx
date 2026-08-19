import { Combobox } from '@base-ui/react/combobox';
import { Check, X } from 'lucide-react';
import { ScrollArea } from '#/components/scroll-area';
import { LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS, type UserLevel } from '#/types';

interface LevelPickerProps {
  /** Currently selected levels. Empty means every level sees the lesson. */
  value: UserLevel[];
  onValueChange: (next: UserLevel[]) => void;
  disabled?: boolean;
}

/**
 * Multi-select level picker: chosen levels as removable chips, the rest in a
 * type-to-filter list. `levels` is a set, not a threshold — an empty
 * selection is the default and means every level sees the lesson; a
 * non-empty selection is exact-match, not a floor or ceiling.
 */
export const LevelPicker = ({
  value,
  onValueChange,
  disabled = false,
}: LevelPickerProps) => {
  return (
    <Combobox.Root
      multiple
      items={USER_LEVELS}
      value={value}
      onValueChange={(next) => onValueChange(next as UserLevel[])}
      itemToStringLabel={(level: UserLevel) => LEVEL_LABELS[level]}
      disabled={disabled}
    >
      {/*
        No <Combobox.Label> here: it only associates with <Combobox.Trigger>,
        and this picker's form control is <Combobox.Input> directly (Base UI
        logs a dev warning if a label is added without a trigger). The
        accessible name is set on the input itself instead.
      */}
      <Combobox.Chips className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-gray-6 bg-gray-1 px-2 py-1.5 focus-within:ring-2 focus-within:ring-apple-9">
        {value.map((level) => (
          <Combobox.Chip
            key={level}
            className="flex items-center gap-1 rounded bg-gray-4 py-0.5 ps-2 pe-1 text-primary text-xs"
          >
            {LEVEL_LABELS[level]}
            <Combobox.ChipRemove
              className="rounded p-0.5 text-secondary transition-colors hover:bg-gray-6 hover:text-primary"
              aria-label={`Remove ${LEVEL_LABELS[level]}`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </Combobox.ChipRemove>
          </Combobox.Chip>
        ))}
        <Combobox.Input
          aria-label="Levels"
          placeholder={value.length === 0 ? 'All levels' : undefined}
          className="min-w-32 flex-1 bg-transparent text-primary text-sm outline-none placeholder:text-tertiary"
        />
      </Combobox.Chips>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          {/*
            The list scrolls inside the shared ScrollArea rather than on the
            popup itself: a raw `overflow-y-auto` here renders the platform
            scrollbar, which on macOS is an opaque bar flush to the edge that
            paints over the popup's rounded corner. ScrollArea's overlay thumb
            only appears while hovering or scrolling, matching every other
            scrolling surface in the app.
          */}
          <Combobox.Popup className="w-[var(--anchor-width)] rounded-md border border-gray-6 bg-gray-2 py-1 shadow-lg">
            <Combobox.Empty className="px-3 py-2 text-secondary text-sm">
              No matching levels
            </Combobox.Empty>
            <ScrollArea className="max-h-64">
              <Combobox.List>
                {(level: UserLevel) => (
                  <Combobox.Item
                    key={level}
                    value={level}
                    className="flex cursor-default items-start gap-2 px-3 py-2 text-primary text-sm data-highlighted:bg-gray-4"
                  >
                    <Combobox.ItemIndicator className="mt-0.5">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </Combobox.ItemIndicator>
                    <span>{LEVEL_LABELS[level]}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </ScrollArea>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
};
