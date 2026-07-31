import { Combobox } from '@base-ui/react/combobox';
import { Check, X } from 'lucide-react';
import { ScrollArea } from '#/components/scroll-area';

export interface DependencyOption {
  slug: string;
  name: string;
  /**
   * Why this module cannot be picked, or null when it can. Non-null options
   * render disabled — with the reason visible, never as a bare greyed row that
   * reads as a bug.
   */
  blockedReason: string | null;
}

interface ModuleDependencyPickerProps {
  /** Accessible name — the module whose prerequisites are being chosen. */
  label: string;
  /** Currently selected prerequisite slugs. */
  value: string[];
  /** Every other module in the course, in rank order. */
  options: DependencyOption[];
  onValueChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * Multi-select prerequisite picker: chosen modules as removable chips, the
 * rest in a type-to-filter list.
 *
 * Values are slugs rather than option objects so the selection is exactly the
 * array that gets persisted — no mapping step between what the admin picked
 * and what the PATCH body carries.
 */
export const ModuleDependencyPicker = ({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
}: ModuleDependencyPickerProps) => {
  const nameBySlug = new Map(options.map((o) => [o.slug, o.name]));
  const blockedBySlug = new Map(options.map((o) => [o.slug, o.blockedReason]));
  const slugs = options.map((o) => o.slug);

  return (
    <Combobox.Root
      multiple
      items={slugs}
      value={value}
      onValueChange={(next) => onValueChange(next as string[])}
      itemToStringLabel={(slug: string) => nameBySlug.get(slug) ?? slug}
      disabled={disabled}
    >
      <Combobox.Label className="sr-only">
        Prerequisites for {label}
      </Combobox.Label>

      <Combobox.Chips className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-gray-6 bg-gray-1 px-2 py-1.5 focus-within:ring-2 focus-within:ring-apple-9">
        {value.map((slug) => (
          <Combobox.Chip
            key={slug}
            className="flex items-center gap-1 rounded bg-gray-4 py-0.5 ps-2 pe-1 text-primary text-xs"
          >
            {nameBySlug.get(slug) ?? slug}
            <Combobox.ChipRemove
              className="rounded p-0.5 text-secondary transition-colors hover:bg-gray-6 hover:text-primary"
              aria-label={`Remove ${nameBySlug.get(slug) ?? slug}`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </Combobox.ChipRemove>
          </Combobox.Chip>
        ))}
        <Combobox.Input
          placeholder={value.length === 0 ? 'No prerequisites' : undefined}
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
              No matching modules
            </Combobox.Empty>
            <ScrollArea className="max-h-64">
              <Combobox.List>
                {(slug: string) => {
                  const blockedReason = blockedBySlug.get(slug) ?? null;
                  return (
                    <Combobox.Item
                      key={slug}
                      value={slug}
                      disabled={blockedReason !== null}
                      className="flex cursor-default items-start gap-2 px-3 py-2 text-primary text-sm data-disabled:cursor-not-allowed data-disabled:text-tertiary data-highlighted:bg-gray-4"
                    >
                      <Combobox.ItemIndicator className="mt-0.5">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </Combobox.ItemIndicator>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span>{nameBySlug.get(slug) ?? slug}</span>
                        {blockedReason && (
                          <span className="text-tertiary text-xs">
                            {blockedReason}
                          </span>
                        )}
                      </span>
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
            </ScrollArea>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
};
