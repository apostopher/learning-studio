import { Tooltip } from '@base-ui/react/tooltip';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { type ChipTone, chipClassName } from '#/components/ui/chip';
import { IconButtonTooltip } from '#/components/ui/tooltip-icon-button';
import { LEVEL_ACRONYMS, LEVEL_LABELS } from '#/lib/level-labels';
import type { OfferingUser } from '#/lib/offering-schemas';
import type { UserLevel } from '#/types';
import { nextRosterLevel } from './roster-level';

/**
 * Rows the table shows before it scrolls. The popover's maximum size is
 * defined as "the form plus this many people", so the row and header heights
 * below are FIXED — a computed max height only means something if the rows
 * it counts are a known size.
 *
 * 12, up from 10, when the form's four-line "ground school" explainer was
 * removed: that paragraph plus its gap was about 6rem, two rows' worth, and
 * the roster is what that height is now spent on.
 */
export const ROSTER_VISIBLE_ROWS = 12;
const ROW_REM = 2.5; // h-10
const HEAD_REM = 2; // h-8

/**
 * A level's chip tone.
 *
 * Four visually distinct tones for four states, all from the shared chip
 * palette so they carry its contrast guarantees rather than a hand-picked
 * colour per level. `null` is muted on purpose: "not levelled yet" is an
 * absence, and dressing it in a hue would make it look like a fourth rung.
 */
export type LevelLockReason = { short: string; full: string };

const LEVEL_TONES: Record<UserLevel, ChipTone> = {
  basic: 'soft-warning',
  intermediate: 'soft-apple',
  advanced: 'soft-success',
};

/** Why a chip is locked — it states its reason, in its name and tooltip. */
const LOCKED_NOTE = 'Locked while the offering saves.';

/** The lesson quickshot's press: quick, with a little overshoot. */
const PRESS_SPRING = { type: 'spring', duration: 0.25, bounce: 0.35 } as const;

const levelTone = (level: UserLevel | null): ChipTone =>
  level ? LEVEL_TONES[level] : 'muted';
const levelText = (level: UserLevel | null) =>
  level ? LEVEL_ACRONYMS[level] : 'No level';
const levelName = (level: UserLevel | null) =>
  level ? LEVEL_LABELS[level] : 'No level';

/**
 * The editable level: one chip that steps to the next level on each press,
 * the way the lesson quickshot's chips toggle. The container saves where the
 * presses stop; this only reports them.
 */
const LevelCycleChip = ({
  name,
  level,
  saving,
  disabled,
  onCycle,
}: {
  name: string;
  level: UserLevel | null;
  saving: boolean;
  disabled: boolean;
  onCycle: () => void;
}) => (
  <span className="inline-flex items-center gap-1.5">
    {/* Closes as soon as the pointer leaves — see `tooltip-icon-button.tsx`. */}
    <Tooltip.Root disableHoverablePopup>
      <Tooltip.Trigger
        // `aria-disabled`, not `disabled`: Base UI's Tooltip.Trigger swallows
        // the native attribute (see lesson-quickshot.tsx). Dropping the handler
        // is what makes it inert to Enter and Space as well as the pointer.
        aria-disabled={disabled || undefined}
        aria-busy={saving || undefined}
        aria-label={`Level for ${name}: ${levelName(level)}. ${
          disabled ? LOCKED_NOTE : 'Press to change.'
        }`}
        render={
          <motion.button
            type="button"
            onClick={disabled ? undefined : onCycle}
            whileTap={disabled ? undefined : { scale: 0.92 }}
            transition={PRESS_SPRING}
          />
        }
        // No opacity when locked: faded chip text drops under AA. The cursor
        // and the dropped handler say it is off for the moment.
        className={chipClassName(
          levelTone(level),
          'cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-apple-9 focus-visible:outline-offset-2 aria-disabled:cursor-not-allowed',
        )}
      >
        {levelText(level)}
      </Tooltip.Trigger>
      <IconButtonTooltip
        label={
          disabled
            ? `${levelName(level)}. ${LOCKED_NOTE}`
            : `${levelName(level)}. Press to make it ${LEVEL_LABELS[nextRosterLevel(level)]} — it saves when you stop pressing. Basic, Intermediate, Advanced, then back to Basic.`
        }
      />
    </Tooltip.Root>
    {saving && (
      <Loader2
        className="h-3 w-3 shrink-0 animate-spin text-secondary"
        aria-hidden="true"
      />
    )}
  </span>
);

/**
 * Who is on this offering.
 *
 * A table rather than a row of chips: a roster is a list of PEOPLE with facts
 * about each — their level decides which lessons they receive — and chips can
 * only carry a name. It is also the shape that scales: a twenty-two person
 * intake wraps into an unreadable block as chips.
 *
 * Presentational. Searching, adding, removing and level changes are the
 * container's.
 */
export const OfferingRosterTable = ({
  users,
  onRemove,
  disabled = false,
  canEditLevels = false,
  levelLockReason = () => null,
  onCycleLevel,
  displayLevel,
  savingUserIds = [],
}: {
  users: OfferingUser[];
  onRemove: (userId: string) => void;
  disabled?: boolean;
  /** `level:update` — without it every level is a read-only chip. */
  canEditLevels?: boolean;
  /**
   * Why this row's level cannot be written here, or null when it can — e.g.
   * the person is not in the user directory (the endpoint is keyed on their
   * profile), or they hold a staff role and only an owner may change it.
   * `short` is shown in the cell; `full` is what assistive tech reads.
   */
  levelLockReason?: (userId: string) => LevelLockReason | null;
  /** The level chip was pressed: step this person to the next level. */
  onCycleLevel?: (userId: string) => void;
  /**
   * The level to show for a row — the container's unsaved choice while one is
   * pending, else the saved one. Defaults to the row's own level.
   */
  displayLevel?: (userId: string) => UserLevel | null;
  /** Rows whose level save is in flight. Their chips stay pressable. */
  savingUserIds?: readonly string[];
}) => {
  const columns: ColumnDef<OfferingUser>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span
          className="block truncate font-medium text-primary"
          title={row.original.name}
        >
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span
          className="block truncate font-mono text-secondary text-xs"
          title={row.original.email}
        >
          {row.original.email}
        </span>
      ),
    },
    {
      accessorKey: 'level',
      header: 'Level',
      cell: ({ row }) => {
        const { userId, name } = row.original;
        const level = displayLevel ? displayLevel(userId) : row.original.level;
        const lock = canEditLevels ? levelLockReason(userId) : null;
        if (canEditLevels && onCycleLevel && lock === null) {
          return (
            <LevelCycleChip
              name={name}
              level={level}
              saving={savingUserIds.includes(userId)}
              disabled={disabled}
              onCycle={() => onCycleLevel(userId)}
            />
          );
        }
        // Read-only: a plain chip, not a button. Named, not left blank — a
        // locked or absent state has to say what it is, and an empty cell
        // reads as a rendering fault.
        const chip = (
          <span
            className={chipClassName(levelTone(level))}
            title={
              level ? LEVEL_LABELS[level] : 'No level set for this course yet'
            }
          >
            {levelText(level)}
          </span>
        );
        if (!lock) return chip;
        // A locked state states its reason, visibly: short in the cell (the
        // column is narrow), whole for assistive tech.
        return (
          <span className="flex flex-col items-start gap-0.5 leading-tight">
            {chip}
            <span
              className="max-w-full truncate text-secondary text-xs"
              title={lock.full}
              aria-hidden="true"
            >
              {lock.short}
            </span>
            <span className="sr-only">{lock.full}</span>
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRemove(row.original.userId)}
          // Names the person: a column of twenty identical "Remove" buttons is
          // unusable to anyone navigating by control.
          aria-label={`Remove ${row.original.name} from this offering`}
          className="whitespace-nowrap rounded-md border border-gray-6 px-2 py-1 font-medium text-secondary text-xs transition-colors hover:border-error-9 hover:bg-error-3 hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Remove
        </button>
      ),
    },
  ];

  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (users.length === 0) {
    return (
      <p className="rounded-lg border border-gray-6 border-dashed px-4 py-6 text-center text-secondary text-sm">
        Nobody is on this offering yet. Search above to add someone — you can
        also leave it empty and add people later.
      </p>
    );
  }

  return (
    // `reducedMotion="user"`: under the preference Motion drops the press
    // scale and keeps the colour change, as on the lesson quickshot.
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-1.5">
        {/* Native overflow, not the shared ScrollArea: its root is block-size
          100%, which needs a definite-height parent, and this box is
          content-sized up to a cap. */}
        <section
          // Physical-axis overflow: Tailwind 4.1 has no overflow-block utility,
          // the same reason as the sticky `top-0` exception below.
          className="overflow-y-auto overscroll-contain rounded-lg border border-gray-6"
          // Inline because Tailwind cannot build a class from these constants. The
          // trailing px term is one border per row, and the 2px is this box's own top and
          // bottom border (border-box), so the last counted row is fully visible.
          style={{
            maxBlockSize: `calc(${HEAD_REM}rem + ${ROSTER_VISIBLE_ROWS} * ${ROW_REM}rem + ${ROSTER_VISIBLE_ROWS}px + 2px)`,
          }}
          // Scrollable region must be reachable and named for keyboard users.
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region has to be focusable or keyboard users cannot scroll it
          tabIndex={0}
          aria-label="People on this offering"
        >
          <table className="w-full table-fixed border-collapse text-sm">
            {/* Fixed layout: column widths, not content, decide where long names
            and emails truncate, so a row can never outgrow the popover. Name
            takes 40%, Email the remainder after Level and actions. Level is
            wide enough for the widest chip plus its saving spinner. */}
            <colgroup>
              <col className="w-[40%]" />
              <col />
              <col className="w-28" />
              <col className="w-24" />
            </colgroup>
            {/* Physical `top`: sticky offset is block-axis here and Tailwind v4 has
            no logical top utility. A CLAUDE.md-sanctioned exception. */}
            <thead className="sticky top-0 z-[1] bg-gray-3">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="h-8">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="whitespace-nowrap px-3 py-0 text-start font-semibold text-secondary text-xs uppercase tracking-wider"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="h-10 border-gray-6 border-t bg-gray-1 hover:bg-gray-2"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-0 align-middle">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {!canEditLevels && (
          // A locked control states why and what unlocks it, in visible text.
          <p className="text-secondary text-xs">
            Levels are view only here. Changing them needs an admin with the
            Levels “update” permission.
          </p>
        )}
      </div>
    </MotionConfig>
  );
};

/** Exported for the popover's count line — "8 on this offering, 3 advanced". */
export function levelSummary(users: OfferingUser[]): string {
  const counted = users.filter((user) => user.level !== null).length;
  if (users.length === 0) return 'Nobody yet';
  const people = `${users.length} ${users.length === 1 ? 'person' : 'people'}`;
  if (counted === users.length) return people;
  return `${people} · ${users.length - counted} without a level for this course`;
}
