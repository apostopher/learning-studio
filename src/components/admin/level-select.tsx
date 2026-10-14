import { Select } from '@base-ui/react/select';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '#/lib/cn';
import { LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS, type UserLevel } from '#/types';

/**
 * A pilot's level in one course, as a Base UI select. Shared by the users
 * page's course rows and the scheduling roster so both offer the same three
 * levels the same way. Pure — the caller owns what a pick does.
 *
 * There is no option back to "no level": levels are append-only, so a person
 * without one shows `placeholder` until a real level is picked.
 */
export const LevelSelect = ({
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
  saving = false,
  placeholder = 'No level',
  valueLabels = LEVEL_LABELS,
  className,
}: {
  value: UserLevel | null;
  onValueChange: (next: UserLevel) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** A change is in flight: the trigger shows a spinner and is locked. */
  saving?: boolean;
  placeholder?: string;
  /**
   * How the chosen value reads on the trigger. Options always use the full
   * names; a dense table can pass `LEVEL_ACRONYMS` for the trigger.
   */
  valueLabels?: Record<UserLevel, string>;
  className?: string;
}) => (
  <Select.Root
    value={value}
    onValueChange={(next) => {
      if (next) onValueChange(next as UserLevel);
    }}
    disabled={disabled || saving}
  >
    <Select.Trigger
      aria-label={ariaLabel}
      aria-busy={saving || undefined}
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-gray-7 bg-gray-1 px-2 py-1 text-primary text-xs transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
        // Locked, without opacity: 60% of the label over gray-1 measures
        // about 4.2:1, under AA. The secondary text token on gray-2 is a
        // measured AA pair, so the label stays legible while it reads as off.
        'data-[disabled]:cursor-not-allowed data-[disabled]:border-gray-6 data-[disabled]:bg-gray-2 data-[disabled]:text-secondary data-[disabled]:hover:bg-gray-2',
        className,
      )}
    >
      <Select.Value>
        {(current: UserLevel | null) =>
          current ? valueLabels[current] : placeholder
        }
      </Select.Value>
      <Select.Icon>
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        )}
      </Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner sideOffset={4} className="z-50">
        <Select.Popup className="rounded-lg border border-gray-6 bg-gray-2 p-1 shadow-lg">
          {USER_LEVELS.map((level) => (
            <Select.Item
              key={level}
              value={level}
              className="cursor-pointer rounded-md px-2 py-1.5 text-primary text-sm data-[highlighted]:bg-gray-4"
            >
              <Select.ItemText>{LEVEL_LABELS[level]}</Select.ItemText>
            </Select.Item>
          ))}
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>
);
