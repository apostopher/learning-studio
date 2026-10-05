import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { type ChipTone, chipClassName } from '#/components/ui/chip';
import { LEVEL_ACRONYMS } from '#/lib/level-labels';
import type { OfferingUser } from '#/lib/offering-schemas';
import type { UserLevel } from '#/types';

/**
 * Rows the table shows before it scrolls. The popover's maximum size is
 * defined as "the form plus this many people", so the row and header heights
 * below are FIXED — a computed max height only means something if the rows
 * it counts are a known size.
 */
export const ROSTER_VISIBLE_ROWS = 10;
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
const LEVEL_TONES: Record<UserLevel, ChipTone> = {
  basic: 'soft-warning',
  intermediate: 'soft-apple',
  advanced: 'soft-success',
};

/**
 * Who is on this offering.
 *
 * A table rather than a row of chips: a roster is a list of PEOPLE with facts
 * about each — their level decides which lessons they receive — and chips can
 * only carry a name. It is also the shape that scales: a twenty-two person
 * intake wraps into an unreadable block as chips.
 *
 * Presentational. Searching, adding and removing are the container's.
 */
export const OfferingRosterTable = ({
  users,
  onRemove,
  disabled = false,
}: {
  users: OfferingUser[];
  onRemove: (userId: string) => void;
  disabled?: boolean;
}) => {
  const columns: ColumnDef<OfferingUser>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span
          className="block max-w-40 truncate font-medium text-primary"
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
          className="block max-w-56 truncate font-mono text-secondary text-xs"
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
        const level = row.original.level;
        return level ? (
          <span className={chipClassName(LEVEL_TONES[level])}>
            {LEVEL_ACRONYMS[level]}
          </span>
        ) : (
          // Named, not left blank. A locked or absent state has to say what it
          // is, and an empty cell reads as a rendering fault.
          <span
            className={chipClassName('muted')}
            title="No level set for this course yet"
          >
            NONE
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
    // Native overflow, not the shared ScrollArea: its root is block-size 100%,
    // which needs a definite-height parent, and this box is content-sized up
    // to a cap.
    <section
      // Physical-axis overflow: Tailwind 4.1 has no overflow-block utility,
      // the same reason as the sticky `top-0` exception below.
      className="overflow-y-auto overscroll-contain rounded-lg border border-gray-6"
      // Inline because Tailwind cannot build a class from these constants. The
      // trailing 10px is one border per row, and the 2px is this box's own top and
      // bottom border (border-box), so the 10th row is fully visible.
      style={{
        maxBlockSize: `calc(${HEAD_REM}rem + ${ROSTER_VISIBLE_ROWS} * ${ROW_REM}rem + ${ROSTER_VISIBLE_ROWS}px + 2px)`,
      }}
      // Scrollable region must be reachable and named for keyboard users.
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region has to be focusable or keyboard users cannot scroll it
      tabIndex={0}
      aria-label="People on this offering"
    >
      <table className="w-full border-collapse text-sm">
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
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

/** Exported for the dialog's count line — "8 on this offering, 3 advanced". */
export function levelSummary(users: OfferingUser[]): string {
  const counted = users.filter((user) => user.level !== null).length;
  if (users.length === 0) return 'Nobody yet';
  const people = `${users.length} ${users.length === 1 ? 'person' : 'people'}`;
  if (counted === users.length) return people;
  return `${people} · ${users.length - counted} without a level for this course`;
}
