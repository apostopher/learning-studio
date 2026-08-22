import { Popover } from '@base-ui/react/popover';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { chipClassName } from '#/components/ui/chip';
import { LEVEL_ACRONYMS, LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS, type UserLevel } from '#/types';

/**
 * The board's level chip: states which pilot levels see a lesson, and opens a
 * picker to change it.
 *
 * Two things about the model drive the whole design, and both are easy to get
 * backwards:
 *
 * 1. `levels` is a **set**, not a rung. A lesson can be tagged for two levels.
 * 2. **Empty means every level** — the default, and the state every untagged
 *    lesson is in. So an empty set is a real, meaningful state that has to be
 *    visible; hiding the chip when untagged would make the control disappear
 *    exactly when an author most needs to find it.
 *
 * Matching is **exact**, not a floor: a lesson tagged `['basic']` is hidden from
 * intermediate and advanced pilots rather than being their easy material. The
 * picker used to spell that out; it now shows only the three acronyms, so the
 * rule lives in the docs and in `LessonLevelChip`'s tests rather than on screen.
 *
 * Deliberately hookless. Base UI's Popover owns its own open state, and this
 * repo's react-compiler + Vitest pipeline nulls the hook dispatcher for any
 * component that calls a hook directly in a render test — the same constraint
 * documented on LinkPopover.
 */
interface LessonLevelChipProps {
  /** The lesson's current levels. Empty means every level. */
  value: readonly UserLevel[];
  onValueChange: (next: UserLevel[]) => void;
  /** The lesson's name, so the trigger's accessible name says which row it is. */
  lessonName: string;
  disabled?: boolean;
}

/** What the trigger reads as to a screen reader — never just "BASIC". */
function triggerLabel(value: readonly UserLevel[], lessonName: string): string {
  const named =
    value.length === 0
      ? 'all levels'
      : value.map((level) => LEVEL_LABELS[level]).join(', ');
  return `Levels for ${lessonName}: ${named}. Change which levels see this lesson.`;
}

export const LessonLevelChip = ({
  value,
  onValueChange,
  lessonName,
  disabled = false,
}: LessonLevelChipProps) => {
  // Ordered by rung rather than by however the array was stored, so two lessons
  // tagged with the same pair always render their chips in the same order.
  const selected = USER_LEVELS.filter((level) => value.includes(level));

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={triggerLabel(value, lessonName)}
        disabled={disabled}
        className="shrink-0 w-14 rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-apple-9 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {selected.length === 0 ? (
          <span className={chipClassName('muted')}>-</span>
        ) : (
          <span className={chipClassName('soft-warning')}>
            {selected.map((level) => LEVEL_ACRONYMS[level].charAt(0)).join('+')}
          </span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-50">
          {/* No fixed width: the popup is exactly its row of chips. The old
              `w-56` was wider than the content yet still squeezed each toggle
              via `flex-1`, which is what wrapped EXPERT to "EXPE RT". */}
          <Popover.Popup className="">
            <ToggleGroup
              multiple
              value={[...value]}
              onValueChange={(next) => onValueChange(next as UserLevel[])}
              // The group carries the name the heading used to; the chips
              // themselves are three acronyms and say nothing on their own.
              aria-label="Levels that see this lesson"
              className="flex flex-col"
            >
              {USER_LEVELS.map((level) => (
                <Toggle
                  key={level}
                  value={level}
                  aria-label={LEVEL_LABELS[level]}
                  className={chipClassName(
                    'muted',
                    'cursor-pointer font-semibold rounded-none! transition-colors hover:bg-gray-5 focus-visible:outline-2 focus-visible:outline-apple-9 focus-visible:outline-offset-2 data-pressed:bg-warning-3 data-pressed:text-warning-text',
                  )}
                >
                  {LEVEL_ACRONYMS[level]}
                </Toggle>
              ))}
            </ToggleGroup>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};
