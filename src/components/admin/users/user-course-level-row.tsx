import { Select } from '@base-ui/react/select';
import { format } from 'date-fns';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { LevelHistoryRow } from '#/data-hooks/use-user-levels';
import { LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS, type UserLevel } from '#/types';

interface UserCourseLevelSelectProps {
  courseName: string;
  level: UserLevel;
  /**
   * `level:update` — the select is interactive. Without it (read-only, i.e.
   * `level:read` alone) the level renders as plain text: this file has no
   * existing "disabled control with a stated reason" pattern to reuse, and a
   * disabled `Select` here would need one invented just for this row, so
   * plain text is the smaller, more honest option — the reason ("View only")
   * is real text content, not a colour or a greyed-out affordance.
   */
  canEdit: boolean;
  /** True while a change for this course is in flight. */
  saving: boolean;
  onLevelChange: (next: UserLevel) => void;
}

/**
 * One enrolled course's competence level, sized to sit at the end of that
 * course's checkbox row. Pure — props in, JSX out, no hooks — the container
 * owns the in-flight state of a change.
 *
 * It is the row's SIBLING of the course's `<label>`, never inside it: a
 * control inside a label is invalid nesting, and a click on the select would
 * also toggle the enrolment checkbox.
 *
 * There is no "N lessons in progress" warning here: computing it needs
 * per-course, per-pilot progress data the user list doesn't otherwise load,
 * and building a new endpoint just to power a warning wasn't worth it for
 * this pass — see the Task 10 report.
 */
export const UserCourseLevelSelect = ({
  courseName,
  level,
  canEdit,
  saving,
  onLevelChange,
}: UserCourseLevelSelectProps) => (
  <div className="flex shrink-0 items-center gap-2">
    {/* The visible word the select's value needs — "Basic" alone does not
        say what it is the level of. The select's accessible name carries
        the course as well. */}
    <span className="text-secondary text-xs" aria-hidden="true">
      Level
    </span>
    {saving && (
      <Loader2
        className="h-3.5 w-3.5 animate-spin text-secondary"
        aria-hidden="true"
      />
    )}
    {canEdit ? (
      <Select.Root
        value={level}
        onValueChange={(next) => onLevelChange(next as UserLevel)}
        disabled={saving}
      >
        <Select.Trigger
          aria-label={`Level in ${courseName}`}
          className="flex items-center gap-1.5 rounded-md border border-gray-7 bg-gray-1 px-2 py-1 text-primary text-xs transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
        >
          <Select.Value>
            {(value: UserLevel) => LEVEL_LABELS[value]}
          </Select.Value>
          <Select.Icon>
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} className="z-50">
            <Select.Popup className="rounded-lg border border-gray-6 bg-gray-2 p-1 shadow-lg">
              {USER_LEVELS.map((value) => (
                <Select.Item
                  key={value}
                  value={value}
                  className="cursor-pointer rounded-md px-2 py-1.5 text-primary text-sm data-[highlighted]:bg-gray-4"
                >
                  <Select.ItemText>{LEVEL_LABELS[value]}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    ) : (
      // Visible text, not a disabled control: the reason ("View only")
      // is real text content so it reaches assistive tech the same way
      // it reaches sighted users, rather than relying on a greyed-out
      // appearance alone.
      <span className="rounded-md border border-gray-7 bg-gray-1 px-2 py-1 text-primary text-xs">
        {LEVEL_LABELS[level]}
        <span className="ms-1.5 text-tertiary">View only</span>
      </span>
    )}
  </div>
);

interface UserCourseLevelHistoryProps {
  /** Only populated for the course whose history is currently open. */
  history: readonly LevelHistoryRow[];
  historyOpen: boolean;
  historyLoading: boolean;
  onToggleHistory: () => void;
}

/**
 * The level's change history behind a disclosure, under the course's row.
 * Render only with `level:read`: a pilot's level can be visible without the
 * history endpoint being reachable if an owner grants `update` without
 * `read`, so the container checks that separately from the select's
 * `canEdit`.
 */
export const UserCourseLevelHistory = ({
  history,
  historyOpen,
  historyLoading,
  onToggleHistory,
}: UserCourseLevelHistoryProps) => (
  <div>
    <button
      type="button"
      onClick={onToggleHistory}
      aria-expanded={historyOpen}
      className="mt-1 text-secondary text-xs underline underline-offset-2 hover:text-primary"
    >
      {historyOpen ? 'Hide history' : 'Show history'}
    </button>

    {historyOpen && (
      <div className="mt-2">
        {historyLoading ? (
          <p className="text-secondary text-xs">Loading history…</p>
        ) : history.length === 0 ? (
          <p className="text-secondary text-xs">No history yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((row) => (
              <li
                key={row.id}
                className="rounded-md border border-gray-6 bg-gray-1 px-2.5 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-x-1.5 text-secondary">
                  <span className="font-medium text-primary">
                    {LEVEL_LABELS[row.level]}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{format(row.createdAt, 'd MMM yyyy')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{row.source}</span>
                  {row.changedBy && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>by {row.changedBy}</span>
                    </>
                  )}
                </div>
                {row.message && (
                  <p className="mt-1 text-primary">“{row.message}”</p>
                )}
                {row.note && (
                  <p className="mt-1 text-secondary">Note: {row.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )}
  </div>
);
