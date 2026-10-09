import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS, type UserLevel } from '#/types';

/**
 * The Update levels board's mode: which level a press on a lesson adds or
 * removes. Exactly one is always on — a single-select segmented control, so
 * an empty group (a press that would do nothing) cannot happen.
 */
export const LevelModeToggle = ({
  value,
  onValueChange,
}: {
  value: UserLevel;
  onValueChange: (next: UserLevel) => void;
}) => (
  <div className="flex items-center gap-2">
    <span id="level-mode-label" className="text-secondary text-sm">
      Tagging
    </span>
    <ToggleGroup
      value={[value]}
      // Base UI lets a press on the active toggle clear the group; ignoring
      // the empty value keeps one mode selected at all times.
      onValueChange={(next) => {
        const picked = next[0] as UserLevel | undefined;
        if (picked) onValueChange(picked);
      }}
      aria-labelledby="level-mode-label"
      className="flex rounded-lg border border-gray-6 bg-gray-2 p-0.5"
    >
      {USER_LEVELS.map((level) => (
        <Toggle
          key={level}
          value={level}
          className="rounded-md px-3 py-1.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 data-pressed:bg-accent data-pressed:text-on-accent"
        >
          {LEVEL_LABELS[level]}
        </Toggle>
      ))}
    </ToggleGroup>
  </div>
);
