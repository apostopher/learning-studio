// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UsersTableSkeleton } from '../users-table-skeleton';

/** Renders the rows inside a real table, which is the only place they are valid. */
function renderSkeleton(columnCount: number, rowCount?: number) {
  return render(
    <table>
      <tbody>
        <UsersTableSkeleton columnCount={columnCount} rowCount={rowCount} />
      </tbody>
    </table>,
  );
}

describe('UsersTableSkeleton', () => {
  it('reserves the real column count, plus the actions column', () => {
    const { container } = renderSkeleton(5, 3);

    // The skeleton stands in for the table's own layout. A row narrower than
    // the real one lets the header and pagination jump when data arrives —
    // which is the whole reason this replaced a centred "Loading people…".
    // `columnCount` is the DATA columns; the table appends an actions column
    // the skeleton must match too.
    const rows = container.querySelectorAll('tr');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelectorAll('td')).toHaveLength(6);
  });

  it('is hidden from assistive tech, every row of it', () => {
    const { container } = renderSkeleton(4);

    // Eight rows of decorative boxes are noise to a screen reader; the wait
    // is announced by the live region in `users-table.tsx` instead. Mutant
    // this catches: `aria-hidden` on the first row only, or dropped — the
    // skeleton would then be read out cell by empty cell.
    const rows = [...container.querySelectorAll('tr')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('carries no text for a reader to announce', () => {
    const { container } = renderSkeleton(4, 2);

    // Belt and braces on the above: even unhidden, there is nothing to read.
    expect(container.textContent).toBe('');
  });
});
