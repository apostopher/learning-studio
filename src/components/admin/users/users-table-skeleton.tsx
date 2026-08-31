/**
 * Loading state for the people table, shaped like the table it precedes.
 *
 * Rows of the real height and column widths, not a centred "Loading people…"
 * — which reserved nothing, so the header and pagination jumped the moment
 * the data arrived. Following `NewsSkeleton`: a skeleton mirrors the layout
 * it stands in for.
 *
 * `aria-hidden` with the live region left to the caller: a screen reader
 * should hear "loading", not eight rows of decorative boxes.
 */
export const UsersTableSkeleton = ({
  columnCount,
  rowCount = 8,
}: {
  /** Data columns, excluding the actions column the table appends itself. */
  columnCount: number;
  rowCount?: number;
}) => (
  <>
    {Array.from({ length: rowCount }, (_, index) => (
      // biome-ignore lint/a11y/noAriaHiddenOnFocusable: the rule guards against hiding focusable content; these rows hold only empty divs, and hiding them is the point — the wait is announced by the live region in `users-table.tsx`
      <tr
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity of their own, and the list is a fixed length that never reorders
        key={index}
        className="animate-pulse border-gray-6 border-b"
        aria-hidden="true"
      >
        {Array.from({ length: columnCount }, (_, column) => (
          <td
            // biome-ignore lint/suspicious/noArrayIndexKey: as above
            key={column}
            className="px-4 py-3"
          >
            {/* The first column carries names and is the widest in the real
                table; the rest are short. Uniform bars would settle into a
                layout the data then contradicts. */}
            <div
              className={
                column === 0
                  ? 'h-4 w-40 rounded bg-gray-4'
                  : 'h-4 w-20 rounded bg-gray-4'
              }
            />
          </td>
        ))}
        <td className="w-px px-4 py-3">
          {/* Sized to the Manage button it stands in for, so the actions
              column does not resize when the rows arrive. */}
          <div className="h-7 w-20 rounded-lg bg-gray-4" />
        </td>
      </tr>
    ))}
  </>
);
