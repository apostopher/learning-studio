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
        <span className="font-medium text-primary">{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="font-mono text-secondary text-xs">
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
          className="rounded-md border border-gray-6 px-2 py-1 font-medium text-secondary text-xs transition-colors hover:border-error-9 hover:bg-error-3 hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="overflow-hidden rounded-lg border border-gray-6">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gray-3">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="px-3 py-2 text-start font-semibold text-secondary text-xs uppercase tracking-wider"
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
              className="border-gray-6 border-t bg-gray-1 hover:bg-gray-2"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
