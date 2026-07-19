import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { cn } from '#/lib/cn';

export interface BinaryToggleOption<V extends string> {
  value: V;
  label: string;
}

interface BinaryToggleProps<V extends string> {
  /** Currently selected value. */
  value: V;
  onValueChange: (next: V) => void;
  options: readonly [BinaryToggleOption<V>, BinaryToggleOption<V>];
  /** Optional value rendered disabled (e.g. an unavailable choice). */
  disabledValue?: V;
  /** Accessible name for the group (the setting name). */
  label: string;
}

/**
 * Two-option single-select segmented control on Base UI ToggleGroup.
 * Presentational: the parent owns the value and persistence. A single-select
 * ToggleGroup emits an empty array when the active item is clicked; that
 * change is ignored so the control always keeps a value.
 */
export const BinaryToggle = <V extends string>({
  value,
  onValueChange,
  options,
  disabledValue,
  label,
}: BinaryToggleProps<V>) => {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(groupValue) => {
        const next = groupValue[0] as V | undefined;
        if (next && next !== value) onValueChange(next);
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-6 bg-gray-1 p-1"
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          disabled={option.value === disabledValue}
          className={cn(
            'rounded-md px-3 py-1.5 font-medium text-gray-11 text-sm transition-colors',
            'hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
            'data-[pressed]:bg-apple-9 data-[pressed]:text-apple-contrast',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
};
