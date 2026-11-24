// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteLessonAtom } from '#/atoms/admin';
import { dataKeys } from '#/data-hooks/keys';

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DeleteLessonDialogContainer } from '../delete-lesson-dialog-container';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const courseShowing = (id: number, name: string, lessonIds: number[]) => ({
  course: { id, name },
  modules: [{ id, lessons: lessonIds.map((lessonId) => ({ id: lessonId })) }],
  remixes: [],
});

function open(courseCount: number, board?: unknown) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  if (board) client.setQueryData(dataKeys.editorBoard(), board);
  // No board: it never answers.
  else fetchMock.mockImplementation(() => new Promise(() => {}));
  const store = createStore();
  store.set(deleteLessonAtom, { id: 10, name: 'Stalls', courseCount });
  render(
    <QueryClientProvider client={client}>
      <Provider store={store}>
        <DeleteLessonDialogContainer />
      </Provider>
    </QueryClientProvider>,
  );
  return { client, store };
}
const deletes = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
const expectNothingToConfirm = () => {
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  expect(document.querySelector('[type="submit"], form')).toBeNull();
};

describe('deleting a lesson in use', () => {
  it('names the courses showing it, A to Z, and offers nothing to confirm', async () => {
    const { store } = open(2, [
      courseShowing(1, 'UAS Mini', [9, 10]),
      courseShowing(2, 'ITPS', [10]),
      courseShowing(3, 'Other', [9]),
    ]);
    expect(
      screen.getByText(
        'Used by ITPS and UAS Mini. Remove it from those courses first.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).not.toMatch(/everywhere/i);
    expectNothingToConfirm();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(store.get(deleteLessonAtom)).toBeNull();
    expect(deletes()).toEqual([]);
  });

  it('a board that shows it outweighs a count that says none', () => {
    open(0, [courseShowing(2, 'ITPS', [10])]);
    expect(
      screen.getByText('Used by ITPS. Remove it from that course first.'),
    ).toBeTruthy();
    expectNothingToConfirm();
  });

  it.each([
    [1, 'Used by 1 course. Remove it from that course first.'],
    [3, 'Used by 3 courses. Remove it from those courses first.'],
  ])('without the board, says how many: %i', (count, text) => {
    open(count);
    expect(screen.getByText(text)).toBeTruthy();
    expectNothingToConfirm();
  });
});

describe('deleting a lesson no course shows', () => {
  const confirm = async () => {
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), 'Stalls');
    await user.click(screen.getByRole('button', { name: 'Delete lesson' }));
  };

  it('asks for its name, then deletes it', async () => {
    const { store } = open(0, [courseShowing(3, 'Other', [9])]);
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 204 }),
    );
    await confirm();
    await waitFor(() => expect(store.get(deleteLessonAtom)).toBeNull());
    expect(deletes().map(([url]) => url)).toEqual(['/api/admin/lessons/10']);
  });

  it('taken meanwhile: gives the reason, nothing to confirm, and refetches what was out of date', async () => {
    const { client } = open(0, [courseShowing(3, 'Other', [9])]);
    client.setQueryData(dataKeys.orgLibrary(), {});
    client.setQueryData(dataKeys.courseBoard(2), {});
    const error = 'Used by ITPS. Remove it from that course first.';
    fetchMock.mockImplementation(async () =>
      Response.json(
        { error, code: 'in-use', courses: [{ id: 2, name: 'ITPS' }] },
        { status: 409 },
      ),
    );
    await confirm();
    expect(await screen.findByText(error)).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).not.toMatch(
      /not in any course|permanently/,
    );
    expectNothingToConfirm();
    // Where the Delete button it replaced had focus.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close' }),
    );
    for (const key of [
      dataKeys.editorBoard(),
      dataKeys.orgLibrary(),
      dataKeys.courseBoard(2),
    ]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it('refused for another reason: still asks, with that reason', async () => {
    const { client } = open(0, [courseShowing(3, 'Other', [9])]);
    fetchMock.mockImplementation(
      async () => new Response('Forbidden', { status: 403 }),
    );
    await confirm();
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /authority over its discipline/,
    );
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(client.getQueryState(dataKeys.editorBoard())?.isInvalidated).toBe(
      false,
    );
  });
});
