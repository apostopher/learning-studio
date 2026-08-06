import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { cn } from '#/lib/cn';

/**
 * A row is either a real account or an email that has been pre-assigned
 * courses but never signed in. They share one table on purpose: splitting them
 * means looking in two places to answer "does this person have access", and a
 * pending row silently migrating between tabs on first sign-in.
 */
export type UserRow = {
  kind: 'user' | 'pending';
  /** Null for a pending row — there is no profile until they sign in. */
  profileId: number | null;
  email: string;
  /** Display name, joined for the table; the parts below feed the edit form. */
  name: string;
  roles: string[];
  courses: { id: number; name: string }[];
  firstName: string | null;
  lastName: string | null;
  callSign: string | null;
  phoneNumber: string | null;
};

interface UsersTableProps {
  rows: UserRow[];
  search: string;
  onSearchChange: (value: string) => void;
  onOpenRow: (row: UserRow) => void;
  isLoading: boolean;
  error?: string;
}

const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium text-primary text-sm">
          {row.original.name || '—'}
        </span>
        <span className="text-secondary text-xs">{row.original.email}</span>
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) =>
      row.original.kind === 'pending' ? (
        <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-warning-text text-xs">
          Pending first sign-in
        </span>
      ) : row.original.roles.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {row.original.roles.map((role) => (
            <span
              key={role}
              className="rounded-full bg-apple-3 px-2 py-0.5 text-apple-text text-xs capitalize"
            >
              {role}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-secondary text-xs">Learner</span>
      ),
  },
  {
    id: 'courses',
    header: 'Courses',
    cell: ({ row }) =>
      row.original.courses.length > 0 ? (
        <span className="text-primary text-sm">
          {row.original.courses.map((c) => c.name).join(', ')}
        </span>
      ) : (
        <span className="text-secondary text-sm">None</span>
      ),
  },
];

/**
 * Filters across name, email and course names at once, so "itps" finds people
 * by their course and "smith" finds them by name without a column picker.
 */
function matches(row: UserRow, term: string): boolean {
  const haystack = [
    row.name,
    row.email,
    ...row.courses.map((c) => c.name),
    ...row.roles,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

export const UsersTable = ({
  rows,
  search,
  onSearchChange,
  onOpenRow,
  isLoading,
  error,
}: UsersTableProps) => {
  const filtered = search.trim()
    ? rows.filter((r) => matches(r, search))
    : rows;

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-primary text-sm">Search</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Name, email or course"
          className="w-full max-w-sm rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-secondary text-sm">Loading people…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-6 border-dashed bg-gray-2 p-10 text-center">
          <p className="font-medium text-primary text-sm">
            {rows.length === 0 ? 'Nobody yet' : 'No matches'}
          </p>
          <p className="mt-1 text-secondary text-sm">
            {rows.length === 0
              ? 'Add someone by email and assign them a course.'
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-6">
          <table className="w-full border-collapse text-start">
            <thead className="bg-gray-2">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="border-gray-6 border-b px-4 py-2.5 text-start font-medium text-secondary text-xs uppercase tracking-wide"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="border-gray-6 border-b px-4 py-2.5"
                  >
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    'bg-gray-1',
                    index > 0 && 'border-gray-6 border-t',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-end">
                    <button
                      type="button"
                      onClick={() => onOpenRow(row.original)}
                      className="rounded-lg border border-gray-6 px-3 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                    >
                      {row.original.kind === 'pending' ? 'View' : 'Manage'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
