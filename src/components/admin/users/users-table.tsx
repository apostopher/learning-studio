import { Select } from '@base-ui/react/select';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp, Search, UserPlus } from 'lucide-react';
import { cn } from '#/lib/cn';
import { LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS, type UserLevel } from '#/types';
import { UserAvatar } from './user-avatar';

/** Sentinel values for the "no filter" option in each Select — nuqs stores
 * "no filter" as a missing param (`null`), but Base UI's `Select` needs a
 * real, non-empty value for that option to be selectable. */
const ALL_COURSES = 'all';
const ALL_LEVELS = 'all';

/**
 * A row is either a real account or an email that has been pre-assigned
 * courses but never signed in. They share one table on purpose: splitting them
 * means looking in two places to answer "does this person have access", and a
 * pending row would silently migrate between tabs on first sign-in.
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
  /** Current level per course id. Absent for a course with no rows. */
  levels: Record<number, UserLevel>;
  joinedAt: string | null;
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
  /** Hidden entirely without `user:create` — see the page container. */
  onAddPerson?: () => void;
  /** All courses, for the course filter — the same list the add/enrol
   * dialogs already load, not fetched again here. */
  courses: { id: number; name: string }[];
  /** Course id as a string (nuqs stores URL params as strings), or `null`
   * when no course is selected. */
  courseFilter: string | null;
  onCourseFilterChange: (courseId: string | null) => void;
  /** `null` when no level is selected, including whenever there is no
   * course selected — the level filter is disabled in that state. */
  levelFilter: string | null;
  onLevelFilterChange: (level: string | null) => void;
}

const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: 'name',
    header: 'Person',
    // Sort by the visible identity: name when there is one, else the email
    // that is actually shown in its place.
    accessorFn: (row) => row.name || row.email,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <UserAvatar name={row.original.name} email={row.original.email} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-primary text-sm">
            {row.original.name || row.original.email}
          </span>
          {row.original.name && (
            <span className="truncate text-secondary text-xs">
              {row.original.email}
            </span>
          )}
        </div>
      </div>
    ),
  },
  {
    id: 'access',
    header: 'Access',
    enableSorting: false,
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
        <span className="text-secondary text-sm">Learner</span>
      ),
  },
  {
    id: 'courses',
    header: 'Courses',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.courses.length > 0 ? (
        <span className="text-primary text-sm">
          {row.original.courses.map((c) => c.name).join(', ')}
        </span>
      ) : (
        // Clerk's convention for an empty cell — reads as "nothing here"
        // rather than as a missing column.
        <span className="text-secondary text-sm">–</span>
      ),
  },
  {
    accessorKey: 'joinedAt',
    header: 'Joined',
    cell: ({ row }) =>
      row.original.joinedAt ? (
        <span className="text-secondary text-sm">
          {new Date(row.original.joinedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      ) : (
        <span className="text-secondary text-sm">–</span>
      ),
  },
];

/**
 * Searches name, email, course names and roles at once, so "itps" finds people
 * by their course and a surname finds them by name — without a column picker.
 */
function matches(row: UserRow, term: string): boolean {
  return [row.name, row.email, ...row.courses.map((c) => c.name), ...row.roles]
    .join(' ')
    .toLowerCase()
    .includes(term.toLowerCase());
}

export interface UserRowFilters {
  search: string;
  /** `null` means "no course chosen" — a level filter never applies then. */
  courseId: number | null;
  /** `null` means "no level chosen" — the course alone doesn't filter rows,
   * since the courses column and the search box already surface course
   * membership. */
  level: UserLevel | null;
}

/**
 * Search composes with the course+level filter (both narrow the same set,
 * independently). The course+level filter only activates once *both* are
 * chosen — a level is meaningless without naming the course it belongs to,
 * since a pilot has one level per course, not one level overall.
 *
 * A pilot with no row for the chosen course — not enrolled, or a pending
 * invite with no profile yet (`levels` is always `{}`) — has no level in
 * that course, so they're excluded rather than treated as any particular
 * level. That's a deliberate choice, not an accident of `?? null`.
 */
export function filterUserRows(
  rows: UserRow[],
  { search, courseId, level }: UserRowFilters,
): UserRow[] {
  const bySearch = search.trim()
    ? rows.filter((r) => matches(r, search))
    : rows;

  if (courseId === null || level === null) return bySearch;

  return bySearch.filter((row) => (row.levels[courseId] ?? null) === level);
}

export const UsersTable = ({
  rows,
  search,
  onSearchChange,
  onOpenRow,
  isLoading,
  error,
  onAddPerson,
  courses,
  courseFilter,
  onCourseFilterChange,
  levelFilter,
  onLevelFilterChange,
}: UsersTableProps) => {
  const courseId = courseFilter === null ? null : Number(courseFilter);
  const validCourseId =
    courseId !== null && Number.isFinite(courseId) ? courseId : null;
  const level =
    levelFilter !== null &&
    (USER_LEVELS as readonly string[]).includes(levelFilter)
      ? (levelFilter as UserLevel)
      : null;

  const filtered = filterUserRows(rows, {
    search,
    courseId: validCourseId,
    level,
  });

  const selectedCourseName = courses.find(
    (c) => String(c.id) === courseFilter,
  )?.name;

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ id: 'joinedAt', desc: true }] satisfies SortingState,
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search
              className="-translate-y-1/2 pointer-events-none absolute start-3 top-1/2 h-4 w-4 text-secondary"
              aria-hidden="true"
            />
            <span className="sr-only">Search people</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search…"
              className="w-64 rounded-lg border border-gray-6 bg-gray-1 py-2 ps-9 pe-3 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            />
          </label>

          <Select.Root
            value={courseFilter ?? ALL_COURSES}
            onValueChange={(next) =>
              onCourseFilterChange(next === ALL_COURSES ? null : String(next))
            }
          >
            <Select.Trigger
              aria-label="Filter by course"
              className="flex items-center gap-1.5 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            >
              <Select.Value>{selectedCourseName ?? 'All courses'}</Select.Value>
              <Select.Icon>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={4} className="z-50">
                <Select.Popup className="rounded-lg border border-gray-6 bg-gray-2 p-1 shadow-lg">
                  <Select.Item
                    value={ALL_COURSES}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-primary text-sm data-[highlighted]:bg-gray-4"
                  >
                    <Select.ItemText>All courses</Select.ItemText>
                  </Select.Item>
                  {courses.map((c) => (
                    <Select.Item
                      key={c.id}
                      value={String(c.id)}
                      className="cursor-pointer rounded-md px-2 py-1.5 text-primary text-sm data-[highlighted]:bg-gray-4"
                    >
                      <Select.ItemText>{c.name}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>

          <Select.Root
            value={levelFilter ?? ALL_LEVELS}
            onValueChange={(next) =>
              onLevelFilterChange(next === ALL_LEVELS ? null : String(next))
            }
            disabled={courseFilter === null}
          >
            <Select.Trigger
              aria-label={
                courseFilter === null
                  ? 'Filter by level — pick a course first'
                  : 'Filter by level'
              }
              className="flex items-center gap-1.5 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-gray-1"
            >
              <Select.Value>
                {courseFilter === null
                  ? 'Pick a course first'
                  : level === null
                    ? 'All levels'
                    : LEVEL_LABELS[level]}
              </Select.Value>
              <Select.Icon>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={4} className="z-50">
                <Select.Popup className="rounded-lg border border-gray-6 bg-gray-2 p-1 shadow-lg">
                  <Select.Item
                    value={ALL_LEVELS}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-primary text-sm data-[highlighted]:bg-gray-4"
                  >
                    <Select.ItemText>All levels</Select.ItemText>
                  </Select.Item>
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
        </div>

        {onAddPerson && (
          <button
            type="button"
            onClick={onAddPerson}
            className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add person
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-6">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-2">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sortable = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className="border-gray-6 border-b px-4 py-2.5 text-start font-medium text-secondary text-xs"
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            // The header states the sort direction rather than
                            // relying on the chevron alone, which conveys
                            // nothing to a screen reader.
                            aria-label={`${header.column.columnDef.header}, ${
                              sorted === 'asc'
                                ? 'sorted ascending'
                                : sorted === 'desc'
                                  ? 'sorted descending'
                                  : 'not sorted'
                            }`}
                            className="inline-flex items-center gap-1 rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {sorted === 'asc' ? (
                              <ChevronUp
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            ) : sorted === 'desc' ? (
                              <ChevronDown
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            ) : null}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </th>
                    );
                  })}
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
              {isLoading ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-10 text-center text-secondary text-sm"
                  >
                    Loading people…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12">
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="font-medium text-primary text-sm">
                        {rows.length === 0 ? 'Nobody yet' : 'No matches'}
                      </span>
                      <span className="text-secondary text-sm">
                        {rows.length === 0
                          ? 'Add someone by email and assign them a course.'
                          : 'Try a different search term.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-gray-6 border-t bg-gray-1 transition-colors hover:bg-gray-2"
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
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length > 0 && (
          // Count only — no pager. Adding one for a handful of rows would be
          // chrome around a number; it earns its place when the list outgrows
          // a screen, not before.
          <div
            className={cn(
              'flex items-center justify-between gap-4 border-gray-6 border-t bg-gray-2 px-4 py-2.5',
              'text-secondary text-xs',
            )}
          >
            <span>
              {filtered.length === rows.length
                ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`
                : `${filtered.length} of ${rows.length} people`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
