import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { LevelsBoardMode } from '#/atoms/admin';
import { LESSON_LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS } from '#/types';

/** None first: it is the odd one out, not a rung above Advanced. */
const MODES: readonly LevelsBoardMode[] = ['none', ...USER_LEVELS];

/**
 * The Update levels board's mode: which level a press on a lesson adds or
 * removes — or None, which hides the lesson from every level. Exactly one is always on — a single-select segmented control, so
 * an empty group (a press that would do nothing) cannot happen.
 */
export const LevelModeToggle = ({
  value,
  onValueChange,
}: {
  value: LevelsBoardMode;
  onValueChange: (next: LevelsBoardMode) => void;
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
        const picked = next[0] as LevelsBoardMode | undefined;
        if (picked) onValueChange(picked);
      }}
      aria-labelledby="level-mode-label"
      className="flex rounded-lg border border-gray-6 bg-gray-2 p-0.5"
    >
      {MODES.map((level) => (
        <Toggle
          key={level}
          value={level}
          className="rounded-md px-3 py-1.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 data-pressed:bg-accent data-pressed:text-on-accent"
        >
          {LESSON_LEVEL_LABELS[level]}
        </Toggle>
      ))}
    </ToggleGroup>
  </div>
);
