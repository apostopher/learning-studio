// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type UserRow, UsersTable } from '../users-table';

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

const row = (n: number): UserRow => ({
  kind: 'user',
  userId: `u${n}`,
  profileId: n,
  email: `pilot${n}@example.com`,
  name: `Pilot ${n}`,
  roles: [],
  courses: [],
  levels: {},
  joinedAt: '2026-01-01T00:00:00.000Z',
  firstName: 'Pilot',
  lastName: String(n),
  callSign: null,
  phoneNumber: null,
});

/**
 * Typing one letter into People search froze the whole tab. With a search
 * term, the table's `data` was a fresh `rows.filter(...)` array on every
 * render; TanStack Table answers new data by resetting the page index, which
 * is a state update, which re-renders, which filters again — forever.
 * (The React Compiler does not memoize components that call `useReactTable`,
 * so nothing stabilised it.)
 */
describe('UsersTable with a search term', () => {
  it('settles after the first keystroke instead of re-rendering forever', async () => {
    const onRender = vi.fn();
    const rows = [row(1), row(2), row(3)];
    const table = (search: string) => (
      <Profiler id="table" onRender={onRender}>
        <UsersTable
          rows={rows}
          search={search}
          onSearchChange={vi.fn()}
          onOpenRow={vi.fn()}
          isLoading={false}
          courses={[]}
          courseFilter={null}
          onCourseFilterChange={vi.fn()}
          levelFilter={null}
          onLevelFilterChange={vi.fn()}
        />
      </Profiler>
    );
    const { rerender } = render(table(''));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    onRender.mockClear();
    // The keystroke: same rows, a search term now.
    rerender(table('p'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    // A handful of commits from mount effects is fine; a loop runs to hundreds.
    expect(onRender.mock.calls.length).toBeLessThan(10);
  });
});
